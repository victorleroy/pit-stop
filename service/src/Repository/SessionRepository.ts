import type {Db} from '~/Db/connection';

export interface SessionRow {
  email: string;
  expiresAt: string;
  name: string;
  pictureUrl: string | null;
  userId: string;
}

/**
 * Opaque sessions (ADR-001 D7). Only the hash of the token is stored, like a password: a database
 * leak does not hand out live sessions.
 */
export class SessionRepository {
  public constructor(private readonly db: Db) {}

  public async create(tokenHash: string, userId: string, expiresAt: string): Promise<void> {
    await this.db
      .insertInto('sessions')
      .values({createdAt: new Date().toISOString(), expiresAt, tokenHash, userId})
      .execute();
  }

  public async findValid(tokenHash: string, now: string): Promise<SessionRow | undefined> {
    return this.db
      .selectFrom('sessions')
      .innerJoin('users', 'users.id', 'sessions.userId')
      .select([
        'sessions.userId',
        'sessions.expiresAt',
        'users.email',
        'users.name',
        'users.pictureUrl',
      ])
      .where('sessions.tokenHash', '=', tokenHash)
      .where('sessions.expiresAt', '>', now)
      .executeTakeFirst();
  }

  public async revoke(tokenHash: string): Promise<void> {
    await this.db.deleteFrom('sessions').where('tokenHash', '=', tokenHash).execute();
  }

  /** Used when the paddock suspends an organisation or removes a member. */
  public async revokeAllForUser(userId: string): Promise<void> {
    await this.db.deleteFrom('sessions').where('userId', '=', userId).execute();
  }

  public async deleteExpired(now: string): Promise<void> {
    await this.db.deleteFrom('sessions').where('expiresAt', '<=', now).execute();
  }
}
