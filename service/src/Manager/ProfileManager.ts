import {v4 as uuid} from 'uuid';
import type {Db} from '~/Db/connection';
import type {AvatarMime} from '~/Db/schema';
import {
  BadRequestHttpError,
  ConflictHttpError,
  NotFoundHttpError,
  TooManyRequestsHttpError,
  UnsupportedMediaTypeHttpError,
} from '~/Error/HttpError';
import type {GoogleProfile} from '~/Client/GoogleClient';
import {logger} from '~/logger';
import type {SessionHub} from '~/Realtime/SessionHub';
import type {OrgRepository} from '~/Repository/OrgRepository';
import type {AvatarRow, UserRepository, UserRow} from '~/Repository/UserRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {RateLimiter} from '~/Security/RateLimiter';
import type {RoleChecker} from '~/Security/RoleChecker';
import {ScopedDb} from '~/Security/ScopedDb';

export const NAME_MAX_LENGTH = 80;

export const AVATAR_MAX_BYTES = 256 * 1024;

// Control and format characters hide or reorder text (U+202E, U+200B...): a name made of them
// impersonates somebody else. The zero-width joiner alone stays, emoji sequences need it.
const INVISIBLE = /(?!‍)[\p{Cc}\p{Cf}]/u;

const collapse = (name: string): string => name.replace(/\s+/gu, ' ').trim();

const codePoints = (value: string): number => [...value].length;

const isBlank = (name: string): boolean => !collapse(name.replace(/\u200d/gu, ''));

/** Normalised first, then checked: the limit applies to what everybody will see. */
export const normalizeDisplayName = (raw: string): string => {
  if (INVISIBLE.test(raw)) {
    throw new BadRequestHttpError('The name contains invisible or control characters');
  }

  const name = collapse(raw);

  if (isBlank(name)) {
    throw new BadRequestHttpError('The name cannot be empty');
  }

  if (codePoints(name) > NAME_MAX_LENGTH) {
    throw new BadRequestHttpError(`The name must be at most ${NAME_MAX_LENGTH} characters`);
  }

  return name;
};

/** The identity provider is not validated against, only cleaned and cut to fit. */
const ssoDisplayName = (profile: GoogleProfile): string => {
  const name = collapse(
    profile.name.replace(/\s+/gu, ' ').replace(new RegExp(INVISIBLE.source, 'gu'), ''),
  );

  return [...(isBlank(name) ? profile.email : name)].slice(0, NAME_MAX_LENGTH).join('');
};

/** The type is read from the bytes, never trusted from the header alone. */
const sniffAvatarMime = (bytes: Buffer): AvatarMime | undefined => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 12 &&
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return undefined;
};

export interface ProfileChanges {
  avatar?: {source: 'auto' | 'initials'};
  name?: string;
  useSsoName?: boolean;
}

/**
 * The user's own name and avatar (BEHAVIOUR.md section 6, Profile). users.name and
 * users.picture_url stay the values every join reads; the *_source columns say whether the
 * user chose them, which is what keeps a choice from being overwritten by the next sign-in.
 */
export class ProfileManager {
  private readonly uploadLimiter = new RateLimiter({max: 10, windowMs: 60 * 60 * 1000});

  public constructor(
    private readonly db: Db,
    private readonly userRepository: UserRepository,
    private readonly orgRepository: OrgRepository,
    private readonly roleChecker: RoleChecker,
    private readonly hub: SessionHub,
  ) {}

  public async updateProfile(auth: AuthContext, changes: ProfileChanges): Promise<void> {
    if (changes.name === undefined && !changes.useSsoName && !changes.avatar) {
      throw new BadRequestHttpError('Nothing to change');
    }

    if (changes.name !== undefined && changes.useSsoName) {
      throw new BadRequestHttpError('Choose either a name or your Google name, not both');
    }

    const name = changes.name === undefined ? undefined : normalizeDisplayName(changes.name);
    const user = await this.findUser(auth.userId);

    if (changes.useSsoName && !user.ssoName) {
      throw new ConflictHttpError('No Google name is known yet: sign in with Google again');
    }

    if (name !== undefined) {
      await this.userRepository.updateProfile(user.id, {name, nameSource: 'user'});
    } else if (changes.useSsoName && user.ssoName) {
      await this.userRepository.updateProfile(user.id, {name: user.ssoName, nameSource: 'sso'});
    }

    if (changes.avatar) {
      await this.userRepository.setAvatarSource(user.id, changes.avatar.source);
    }

    await this.refreshLiveRetros(auth.db);
  }

  public async uploadAvatar(auth: AuthContext, contentType: string, bytes: Buffer): Promise<void> {
    if (!this.uploadLimiter.consume(auth.userId)) {
      throw new TooManyRequestsHttpError('Too many uploads, try again in an hour');
    }

    const declared = contentType.split(';')[0]?.trim().toLowerCase();
    const mime = sniffAvatarMime(bytes);

    // Both have to agree: a JPEG announced as WebP is refused like a PNG or an SVG would be.
    if (!mime || mime !== declared) {
      throw new UnsupportedMediaTypeHttpError('Upload a WebP or JPEG image');
    }

    await this.userRepository.replaceAvatar(auth.userId, {bytes, id: `av_${uuid()}`, mime});
    await this.refreshLiveRetros(auth.db);
  }

  public async deleteAvatar(auth: AuthContext): Promise<void> {
    const user = await this.findUser(auth.userId);

    if (user.avatarSource === 'upload') {
      await this.userRepository.setAvatarSource(user.id, 'auto');
      await this.refreshLiveRetros(auth.db);
    }
  }

  /** Moderation is removal only: an administrator never sets somebody else's avatar or name. */
  public async removeMemberAvatar(auth: AuthContext, userId: string): Promise<void> {
    await this.roleChecker.checkOrgAdmin(auth);

    const membership = await this.orgRepository.findMembership(userId);

    if (!membership || membership.orgId !== auth.orgId) {
      throw new NotFoundHttpError(`User "${userId}" not found in this organisation`);
    }

    const user = await this.findUser(userId);

    if (user.avatarSource !== 'upload') {
      return;
    }

    await this.userRepository.setAvatarSource(userId, 'auto');
    logger.info({actorId: auth.userId, userId}, 'Avatar removed by org admin');
    await this.refreshLiveRetros(auth.db);
  }

  public async findAvatar(avatarId: string): Promise<AvatarRow> {
    const avatar = await this.userRepository.findAvatar(avatarId);

    if (!avatar) {
      throw new NotFoundHttpError('Avatar not found');
    }

    return avatar;
  }

  /**
   * Records what Google says on every sign-in, and applies it where the user chose nothing:
   * the name while it is Google's, the picture while the avatar is automatic. `claimName`
   * gives the name to Google whatever its source: a new account, or one registered by
   * somebody who never proved the address.
   *
   * Returns whether the displayed name or picture changed.
   */
  public async applySsoProfile(
    user: UserRow,
    profile: GoogleProfile,
    claimName: boolean,
  ): Promise<boolean> {
    const ssoName = ssoDisplayName(profile);
    const ssoPictureUrl = profile.pictureUrl ?? null;
    const followsName = claimName || user.nameSource === 'sso';
    const followsPicture = user.avatarSource === 'auto';

    await this.userRepository.updateProfile(user.id, {
      ssoName,
      ssoPictureUrl,
      ...(followsName ? {name: ssoName, nameSource: 'sso' as const} : {}),
      ...(followsPicture ? {pictureUrl: ssoPictureUrl} : {}),
    });

    return (
      (followsName && ssoName !== user.name) ||
      (followsPicture && ssoPictureUrl !== user.pictureUrl)
    );
  }

  /**
   * Names and avatars are joined at read time, so every live board of the organisation may
   * show the person: authors of notes, assignees, former team members. Each one is refreshed
   * from its own queue; the board broadcast also refreshes the presence (Authorizer).
   */
  public async refreshLiveRetros(scoped: ScopedDb): Promise<void> {
    const live = this.hub.liveRetroIds();

    if (!live.length) {
      return;
    }

    // The profile has committed by now: a failed refresh must not turn it into an error.
    try {
      const retros = await scoped.retros().select('id').where('id', 'in', live).execute();

      await this.hub.refreshRetros(retros.map((retro) => retro.id));
    } catch (error: unknown) {
      logger.error({err: error, orgId: scoped.orgId}, 'Profile refresh of live retros failed');
    }
  }

  /** Sign-in has no AuthContext yet: the scope comes from the organisation just resolved. */
  public async refreshLiveRetrosOf(orgId: string): Promise<void> {
    await this.refreshLiveRetros(new ScopedDb(this.db, orgId));
  }

  private async findUser(userId: string): Promise<UserRow> {
    const user = await this.userRepository.findOneById(userId);

    if (!user) {
      throw new NotFoundHttpError(`User "${userId}" not found`);
    }

    return user;
  }
}
