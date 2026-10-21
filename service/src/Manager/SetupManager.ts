import {hash as argonHash} from '@node-rs/argon2';
import {v4 as uuid} from 'uuid';
import {config} from '~/config';
import type {Db} from '~/Db/connection';
import {ConflictHttpError, ForbiddenHttpError} from '~/Error/HttpError';
import {logger} from '~/logger';
import type {AuthManager} from '~/Manager/AuthManager';
import type {AuthResponseModel} from '~/Model/UserModel';
import {OrgRepository} from '~/Repository/OrgRepository';
import {UserRepository} from '~/Repository/UserRepository';
import {TokenService} from '~/Security/TokenService';

export interface SetupInput {
  email: string;
  name: string;
  orgName: string;
  password: string;
  token: string;
}

/**
 * First boot of an empty instance (ADR-002 D6).
 *
 * Sign-up is invitation only and nobody exists to invite, so the first administrator comes
 * from a one-time link printed in the logs. Reading the logs is what proves you operate the
 * instance, exactly like `PLATFORM_ADMIN_EMAILS` proves it by deploying. The token lives in
 * memory only: a restart before setup prints a new one, and none survives the first account.
 */
export class SetupManager {
  private token: string | undefined;

  private isCompleting = false;

  public constructor(
    private readonly db: Db,
    private readonly orgRepository: OrgRepository,
    private readonly userRepository: UserRepository,
    private readonly authManager: AuthManager,
  ) {}

  public async isRequired(): Promise<boolean> {
    return (await this.orgRepository.count()) === 0;
  }

  public async announce(): Promise<string | undefined> {
    if (!(await this.isRequired())) {
      return undefined;
    }

    this.token = TokenService.generate();

    logger.warn(
      {link: `${config.appUrl}/setup/${this.token}`},
      'No organisation yet: open this link to create the first administrator',
    );

    return this.token;
  }

  public async complete(input: SetupInput): Promise<AuthResponseModel> {
    if (!this.token || !TokenService.equals(this.token, input.token)) {
      throw new ForbiddenHttpError('This setup link is not valid, use the one printed in the logs');
    }

    // Set before the first await: two submissions racing cannot both get through.
    if (this.isCompleting) {
      throw new ConflictHttpError('Setup is already in progress');
    }

    this.isCompleting = true;

    try {
      return await this.createFirstAdministrator(input);
    } finally {
      this.isCompleting = false;
    }
  }

  private async createFirstAdministrator(input: SetupInput): Promise<AuthResponseModel> {
    const email = input.email.toLowerCase();

    if (!(await this.isRequired())) {
      this.token = undefined;
      throw new ConflictHttpError('This instance is already set up');
    }

    if (await this.userRepository.findOneByEmail(email)) {
      throw new ConflictHttpError('An account already exists for this email');
    }

    const orgId = `org_${uuid()}`;
    const userId = `usr_${uuid()}`;
    const passwordHash = await argonHash(input.password);

    // All or nothing: a half-created organisation would end setup with nobody able to sign in.
    await this.db.transaction().execute(async (trx) => {
      const orgs = new OrgRepository(trx);
      const users = new UserRepository(trx);

      await orgs.create({id: orgId, name: input.orgName, status: 'active'});
      await users.create({email, emailVerified: true, id: userId, name: input.name});
      await users.upsertCredential({kind: 'password', passwordHash, userId});
      await orgs.addMember(orgId, userId, 'admin');
    });
    this.token = undefined;

    const user = await this.userRepository.findOneById(userId);

    if (!user) {
      throw new ConflictHttpError('Could not create the first administrator');
    }

    logger.info({orgId, userId}, 'Instance set up');

    return this.authManager.issueSession(user);
  }
}
