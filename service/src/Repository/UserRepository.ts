import type {Db} from '~/Db/connection';
import type {CredentialKind} from '~/Db/schema';

export interface UserRow {
  createdAt: string;
  email: string;
  emailVerifiedAt: string | null;
  id: string;
  name: string;
  pictureUrl: string | null;
}

export class UserRepository {
  public constructor(private readonly db: Db) {}

  public async findOneById(userId: string): Promise<UserRow | undefined> {
    return this.db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst();
  }

  public async findOneByEmail(email: string): Promise<UserRow | undefined> {
    return this.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email.toLowerCase())
      .executeTakeFirst();
  }

  /** Google sign-in resolves an existing account through its provider id first. */
  public async findOneByProvider(
    kind: CredentialKind,
    providerId: string,
  ): Promise<UserRow | undefined> {
    return this.db
      .selectFrom('credentials')
      .innerJoin('users', 'users.id', 'credentials.userId')
      .selectAll('users')
      .where('credentials.kind', '=', kind)
      .where('credentials.providerId', '=', providerId)
      .executeTakeFirst();
  }

  public async create(input: {
    email: string;
    emailVerified: boolean;
    id: string;
    name: string;
    pictureUrl?: string;
  }): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .insertInto('users')
      .values({
        createdAt: now,
        email: input.email.toLowerCase(),
        emailVerifiedAt: input.emailVerified ? now : null,
        id: input.id,
        name: input.name,
        pictureUrl: input.pictureUrl ?? null,
      })
      .execute();
  }

  public async updateProfile(
    userId: string,
    changes: {name?: string; pictureUrl?: string},
  ): Promise<void> {
    if (!Object.keys(changes).length) {
      return;
    }

    await this.db.updateTable('users').set(changes).where('id', '=', userId).execute();
  }

  public async markEmailVerified(userId: string): Promise<void> {
    await this.db
      .updateTable('users')
      .set({emailVerifiedAt: new Date().toISOString()})
      .where('id', '=', userId)
      .where('emailVerifiedAt', 'is', null)
      .execute();
  }

  public async findPasswordHash(userId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('credentials')
      .select('passwordHash')
      .where('userId', '=', userId)
      .where('kind', '=', 'password')
      .executeTakeFirst();

    return row?.passwordHash ?? undefined;
  }

  public async upsertCredential(input: {
    kind: CredentialKind;
    passwordHash?: string;
    providerId?: string;
    userId: string;
  }): Promise<void> {
    await this.db
      .insertInto('credentials')
      .values({
        createdAt: new Date().toISOString(),
        kind: input.kind,
        passwordHash: input.passwordHash ?? null,
        providerId: input.providerId ?? null,
        userId: input.userId,
      })
      .onConflict((oc) =>
        oc.columns(['userId', 'kind']).doUpdateSet({
          passwordHash: input.passwordHash ?? null,
          providerId: input.providerId ?? null,
        }),
      )
      .execute();
  }

  public async removeCredential(userId: string, kind: CredentialKind): Promise<void> {
    await this.db
      .deleteFrom('credentials')
      .where('userId', '=', userId)
      .where('kind', '=', kind)
      .execute();
  }
}
