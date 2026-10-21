import {hash as argonHash} from '@node-rs/argon2';
import {config} from '~/config';
import type {Db} from '~/Db/connection';
import {ConflictHttpError, TooManyRequestsHttpError} from '~/Error/HttpError';
import type {Mailer} from '~/Mail/Mailer';
import {passwordResetEmail} from '~/Mail/templates';
import type {SessionRepository} from '~/Repository/SessionRepository';
import type {UserRepository} from '~/Repository/UserRepository';
import {RateLimiter} from '~/Security/RateLimiter';
import {TokenService} from '~/Security/TokenService';

export class PasswordResetManager {
  private readonly limiter = new RateLimiter({max: 3, windowMs: 60 * 60 * 1000});

  public constructor(
    private readonly db: Db,
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly mailer: Mailer,
  ) {}

  /**
   * Always answers the same way, whether or not the address is known: the response must not
   * turn this route into an account enumeration oracle.
   */
  public async request(email: string): Promise<void> {
    const key = email.toLowerCase();

    if (!this.limiter.consume(key)) {
      throw new TooManyRequestsHttpError('Too many attempts, try again later');
    }

    const user = await this.userRepository.findOneByEmail(key);

    if (!user) {
      return;
    }

    const token = TokenService.generate();

    await this.db
      .insertInto('passwordResets')
      .values({
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + config.passwordResetTtlMinutes * 60 * 1000,
        ).toISOString(),
        tokenHash: TokenService.hash(token),
        usedAt: null,
        userId: user.id,
      })
      .execute();

    await this.mailer.send({...passwordResetEmail(token), to: user.email});
  }

  /** Choosing a new password cuts every existing session: that is the point (ADR D7). */
  public async confirm(token: string, password: string): Promise<void> {
    const tokenHash = TokenService.hash(token);
    const now = new Date().toISOString();

    const reset = await this.db
      .selectFrom('passwordResets')
      .selectAll()
      .where('tokenHash', '=', tokenHash)
      .where('usedAt', 'is', null)
      .where('expiresAt', '>', now)
      .executeTakeFirst();

    if (!reset) {
      throw new ConflictHttpError('This reset link is no longer valid');
    }

    await this.userRepository.upsertCredential({
      kind: 'password',
      passwordHash: await argonHash(password),
      userId: reset.userId,
    });

    await this.db
      .updateTable('passwordResets')
      .set({usedAt: now})
      .where('tokenHash', '=', tokenHash)
      .execute();

    await this.sessionRepository.revokeAllForUser(reset.userId);
  }
}
