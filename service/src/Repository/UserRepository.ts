import type {Db} from '~/Db/connection';
import type {AvatarMime, AvatarSource, CredentialKind, NameSource} from '~/Db/schema';

export interface UserRow {
  avatarSource: AvatarSource;
  createdAt: string;
  email: string;
  emailVerifiedAt: string | null;
  id: string;
  name: string;
  nameSource: NameSource;
  pictureUrl: string | null;
  ssoName: string | null;
  ssoPictureUrl: string | null;
}

export interface AvatarRow {
  bytes: Buffer;
  mime: AvatarMime;
}

/** The URL every join reads for an uploaded avatar: a new id per upload busts every cache. */
export const avatarUrl = (avatarId: string): string => `/api/avatars/${avatarId}`;

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
    changes: {
      avatarSource?: AvatarSource;
      name?: string;
      nameSource?: NameSource;
      pictureUrl?: string | null;
      ssoName?: string;
      ssoPictureUrl?: string | null;
    },
  ): Promise<void> {
    if (!Object.keys(changes).length) {
      return;
    }

    await this.db.updateTable('users').set(changes).where('id', '=', userId).execute();
  }

  /**
   * Leaving `upload` deletes the stored image in the same transaction as the new source, so
   * there is never an orphaned image nor a picture_url pointing at nothing.
   */
  public async setAvatarSource(
    userId: string,
    source: Exclude<AvatarSource, 'upload' | 'preset'>,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('userAvatars').where('userId', '=', userId).execute();
      await trx
        .updateTable('users')
        .set((eb) => ({
          avatarSource: source,
          pictureUrl: source === 'auto' ? eb.ref('ssoPictureUrl') : null,
        }))
        .where('id', '=', userId)
        .execute();
    });
  }

  /** At most one uploaded avatar per user: a new upload replaces the previous one atomically. */
  public async replaceAvatar(
    userId: string,
    avatar: {bytes: Buffer; id: string; mime: AvatarMime},
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('userAvatars').where('userId', '=', userId).execute();
      await trx
        .insertInto('userAvatars')
        .values({
          bytes: avatar.bytes,
          createdAt: new Date().toISOString(),
          id: avatar.id,
          mime: avatar.mime,
          size: avatar.bytes.length,
          userId,
        })
        .execute();
      await trx
        .updateTable('users')
        .set({avatarSource: 'upload', pictureUrl: avatarUrl(avatar.id)})
        .where('id', '=', userId)
        .execute();
    });
  }

  public async findAvatar(avatarId: string): Promise<AvatarRow | undefined> {
    return this.db
      .selectFrom('userAvatars')
      .select(['bytes', 'mime'])
      .where('id', '=', avatarId)
      .executeTakeFirst();
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
