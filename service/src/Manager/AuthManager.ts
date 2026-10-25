import {hash as argonHash, verify as argonVerify} from '@node-rs/argon2';
import {v4 as uuid} from 'uuid';
import {config} from '~/config';
import type {Db} from '~/Db/connection';
import {
  ConflictHttpError,
  ForbiddenHttpError,
  NotFoundHttpError,
  TooManyRequestsHttpError,
  UnauthorizedHttpError,
} from '~/Error/HttpError';
import type {GoogleClient} from '~/Client/GoogleClient';
import type {Mailer} from '~/Mail/Mailer';
import {emailVerificationEmail} from '~/Mail/templates';
import type {AuthResponseModel, UserModel} from '~/Model/UserModel';
import type {InvitationRepository} from '~/Repository/InvitationRepository';
import type {OrgRepository} from '~/Repository/OrgRepository';
import type {SessionRepository} from '~/Repository/SessionRepository';
import type {UserRepository, UserRow} from '~/Repository/UserRepository';
import {TokenService} from '~/Security/TokenService';
import {ScopedDb} from '~/Security/ScopedDb';
import type {AuthContext} from '~/Security/AuthContext';
import {checkSeatAvailable} from '~/Security/Plans';
import {RateLimiter} from '~/Security/RateLimiter';

// After the last "@": a quoted local part may hold "@" too, and the mail goes to the last one.
const domainOf = (email: string): string => email.slice(email.lastIndexOf('@') + 1).toLowerCase();

// Verified against when the account does not exist, so a miss costs as much as a wrong password.
const DUMMY_HASH = argonHash('pit-stop timing equaliser');

const INVITATION_ONLY =
  'This service is invitation only. Ask an administrator of your organisation for an invitation.';

/**
 * No open sign-up in v1 (ADR-001 D12): an account is created either by accepting an invitation,
 * or by registering with an email whose domain a customer organisation has verified.
 */
export class AuthManager {
  private readonly loginLimiter = new RateLimiter({max: 10, windowMs: 15 * 60 * 1000});

  private readonly registerLimiter = new RateLimiter({max: 3, windowMs: 60 * 60 * 1000});

  public constructor(
    private readonly db: Db,
    private readonly googleClient: GoogleClient,
    private readonly userRepository: UserRepository,
    private readonly orgRepository: OrgRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly invitationRepository: InvitationRepository,
    private readonly mailer: Mailer,
  ) {}

  public async loginWithGoogle(idToken: string): Promise<AuthResponseModel> {
    const profile = await this.googleClient.verifyIdToken(idToken);

    // Google asserts the address, so the account can be linked by verified email (ADR-001 D4).
    let user =
      (await this.userRepository.findOneByProvider('google', profile.sub)) ??
      (await this.userRepository.findOneByEmail(profile.email));

    if (!user) {
      user = await this.registerByVerifiedDomain({
        email: profile.email,
        name: profile.name,
        ...(profile.pictureUrl ? {pictureUrl: profile.pictureUrl} : {}),
      });
    } else if (!user.emailVerifiedAt) {
      // Somebody registered this address without proving it: Google now proves it, so the
      // password they chose and any session they hold go, before the account is linked.
      await this.takeOverUnverified(user.id);
      await this.joinByVerifiedDomain(user);
    }

    await this.userRepository.upsertCredential({
      kind: 'google',
      providerId: profile.sub,
      userId: user.id,
    });
    await this.userRepository.markEmailVerified(user.id);

    return this.issueSession(user);
  }

  /**
   * Registering by a verified domain opens nothing until the address is proven: the account
   * waits, with no session, no organisation and no password, for the link sent to that
   * mailbox. Without that step anybody could register as a colleague, or as a platform admin.
   *
   * The password is chosen on the link, by whoever holds the mailbox. Chosen here, it would
   * belong to whoever typed the address, and survive the owner's click on the confirmation.
   */
  public async register(input: {email: string; name: string}): Promise<void> {
    const email = input.email.toLowerCase();

    if (!this.registerLimiter.consume(email)) {
      throw new TooManyRequestsHttpError('Too many attempts, try again later');
    }

    if (!(await this.orgRepository.findOrgByVerifiedDomain(domainOf(email)))) {
      throw new ForbiddenHttpError(INVITATION_ONLY);
    }

    const existing = await this.userRepository.findOneByEmail(email);

    if (existing?.emailVerifiedAt) {
      throw new ConflictHttpError('An account already exists for this email');
    }

    // An unverified account proves nothing: registering again simply replaces it, so nobody
    // can squat an address they do not own.
    const userId = existing?.id ?? `usr_${uuid()}`;

    if (existing) {
      await this.takeOverUnverified(userId);
      await this.userRepository.updateProfile(userId, {name: input.name});
    } else {
      await this.userRepository.create({email, emailVerified: false, id: userId, name: input.name});
    }

    const token = TokenService.generate();

    await this.db
      .insertInto('emailVerifications')
      .values({
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + config.passwordResetTtlMinutes * 60 * 1000,
        ).toISOString(),
        tokenHash: TokenService.hash(token),
        usedAt: null,
        userId,
      })
      .execute();

    await this.mailer.send({...emailVerificationEmail(token), to: email});
  }

  public async verifyEmail(token: string, password: string): Promise<AuthResponseModel> {
    const now = new Date().toISOString();
    const verification = await this.db
      .selectFrom('emailVerifications')
      .selectAll()
      .where('tokenHash', '=', TokenService.hash(token))
      .where('usedAt', 'is', null)
      .where('expiresAt', '>', now)
      .executeTakeFirst();

    if (!verification) {
      throw new ConflictHttpError('This confirmation link is no longer valid');
    }

    await this.db
      .updateTable('emailVerifications')
      .set({usedAt: now})
      .where('tokenHash', '=', verification.tokenHash)
      .execute();

    const user = await this.userRepository.findOneById(verification.userId);

    if (!user) {
      throw new NotFoundHttpError('This account no longer exists');
    }

    await this.joinByVerifiedDomain(user);
    await this.userRepository.upsertCredential({
      kind: 'password',
      passwordHash: await argonHash(password),
      userId: user.id,
    });
    await this.userRepository.markEmailVerified(user.id);

    return this.issueSession(user);
  }

  public async loginWithPassword(email: string, password: string): Promise<AuthResponseModel> {
    const key = email.toLowerCase();

    if (!this.loginLimiter.consume(key)) {
      throw new TooManyRequestsHttpError('Too many attempts, try again later');
    }

    const user = await this.userRepository.findOneByEmail(key);
    const storedHash = user ? await this.userRepository.findPasswordHash(user.id) : undefined;
    const matches = await argonVerify(storedHash ?? (await DUMMY_HASH), password);

    // Same error and same cost either way: the response must not disclose whether the account
    // exists.
    if (!user || !storedHash || !matches) {
      throw new UnauthorizedHttpError('Wrong email or password');
    }

    this.loginLimiter.reset(key);

    if (!user.emailVerifiedAt) {
      throw new ForbiddenHttpError('Confirm your email address first, with the link we sent');
    }

    return this.issueSession(user);
  }

  /** Local convenience only, guarded exactly as before (BEHAVIOUR.md section 11). */
  public async devLogin(email: string, name?: string): Promise<AuthResponseModel> {
    if (!config.isLocal) {
      throw new ForbiddenHttpError('Dev login is only available locally');
    }

    const normalized = email.toLowerCase();
    const existing = await this.userRepository.findOneByEmail(normalized);

    if (existing) {
      return this.issueSession(existing);
    }

    const user = await this.registerByVerifiedDomain({
      email: normalized,
      name: name ?? normalized.split('@')[0] ?? normalized,
      allowBootstrap: true,
    });

    return this.issueSession(user);
  }

  public async resolveSession(token: string): Promise<AuthContext | undefined> {
    const session = await this.sessionRepository.findValid(
      TokenService.hash(token),
      new Date().toISOString(),
    );

    if (!session) {
      return undefined;
    }

    const membership = await this.orgRepository.findMembership(session.userId);

    if (!membership) {
      return undefined;
    }

    const org = await this.orgRepository.findOneById(membership.orgId);

    if (!org || org.status === 'suspended') {
      return undefined;
    }

    return {
      db: new ScopedDb(this.db, org.id),
      email: session.email,
      isPlatformAdmin: config.platformAdminEmails.includes(session.email.toLowerCase()),
      name: session.name,
      orgId: org.id,
      orgStatus: org.status,
      ...(session.pictureUrl ? {pictureUrl: session.pictureUrl} : {}),
      userId: session.userId,
    };
  }

  public async findUser(userId: string): Promise<UserRow> {
    const user = await this.userRepository.findOneById(userId);

    if (!user) {
      throw new NotFoundHttpError(`User "${userId}" not found`);
    }

    return user;
  }

  /** Expired sessions, and one-time tokens spent or expired: nothing reads them again. */
  public async purgeExpired(): Promise<void> {
    const now = new Date().toISOString();

    await this.sessionRepository.deleteExpired(now);

    for (const table of ['emailVerifications', 'passwordResets'] as const) {
      await this.db
        .deleteFrom(table)
        .where((eb) => eb.or([eb('expiresAt', '<=', now), eb('usedAt', 'is not', null)]))
        .execute();
    }
  }

  public async logout(token: string): Promise<void> {
    await this.sessionRepository.revoke(TokenService.hash(token));
  }

  public async getMe(auth: AuthContext): Promise<UserModel> {
    const user = await this.userRepository.findOneById(auth.userId);

    if (!user) {
      throw new NotFoundHttpError(`User "${auth.userId}" not found`);
    }

    const [membership, org] = await Promise.all([
      this.orgRepository.findMembership(user.id),
      this.orgRepository.findOneById(auth.orgId),
    ]);

    return {
      email: user.email,
      id: user.id,
      isOrgAdmin: membership?.role === 'admin',
      isPlatformAdmin: auth.isPlatformAdmin,
      name: user.name,
      orgId: auth.orgId,
      ...(org ? {orgName: org.name, orgStatus: org.status} : {}),
      ...(user.pictureUrl ? {pictureUrl: user.pictureUrl} : {}),
    };
  }

  /**
   * Auto-join only ever grants `member`, and only on a verified domain. The `admin` role is
   * reachable through an invitation alone (ADR-001 D12).
   */
  private async registerByVerifiedDomain(input: {
    allowBootstrap?: boolean;
    email: string;
    name: string;
    pictureUrl?: string;
  }): Promise<UserRow> {
    const domain = domainOf(input.email);
    const verifiedOrgId = await this.orgRepository.findOrgByVerifiedDomain(domain);

    if (verifiedOrgId) {
      return this.createUserIn(verifiedOrgId, input);
    }

    if (input.allowBootstrap) {
      // An organisation may already claim this domain without having verified it yet, which
      // is exactly what the paddock produces. Joining it is right; inventing a second
      // organisation for the same domain never is.
      const claimedOrgId = await this.orgRepository.findOrgByDomain(domain);

      if (claimedOrgId) {
        return this.createUserIn(claimedOrgId, input);
      }

      return this.bootstrapLocalOrg(input);
    }

    throw new ForbiddenHttpError(INVITATION_ONLY);
  }

  /**
   * Drops what an unproven registration left behind: its password, its sessions, and the
   * confirmation links already sent. A link left valid would verify the account under
   * whichever password was set last, the squatter's included.
   */
  private async takeOverUnverified(userId: string): Promise<void> {
    await this.userRepository.removeCredential(userId, 'password');
    await this.sessionRepository.revokeAllForUser(userId);
    await this.db.deleteFrom('emailVerifications').where('userId', '=', userId).execute();
  }

  /** A freshly proven address joins its verified domain's organisation, as a member. */
  private async joinByVerifiedDomain(user: UserRow): Promise<void> {
    if (await this.orgRepository.findMembership(user.id)) {
      return;
    }

    const orgId = await this.orgRepository.findOrgByVerifiedDomain(domainOf(user.email));

    if (!orgId) {
      throw new ForbiddenHttpError(INVITATION_ONLY);
    }

    await checkSeatAvailable(this.orgRepository, orgId);
    await this.orgRepository.addMember(orgId, user.id, 'member');
  }

  /** Joins an existing organisation as a plain member: `admin` only ever comes from an invitation. */
  private async createUserIn(
    orgId: string,
    input: {email: string; name: string; pictureUrl?: string},
  ): Promise<UserRow> {
    const id = `usr_${uuid()}`;

    await checkSeatAvailable(this.orgRepository, orgId);
    await this.userRepository.create({
      email: input.email,
      emailVerified: true,
      id,
      name: input.name,
      ...(input.pictureUrl ? {pictureUrl: input.pictureUrl} : {}),
    });
    await this.orgRepository.addMember(orgId, id, 'member');

    const created = await this.userRepository.findOneById(id);

    if (!created) {
      throw new ConflictHttpError('Could not create the account');
    }

    return created;
  }

  /** Local only: keeps `npm start` usable without seeding an organisation by hand. */
  private async bootstrapLocalOrg(input: {email: string; name: string}): Promise<UserRow> {
    const domain = domainOf(input.email);
    const orgId = `org_${uuid()}`;
    const userId = `usr_${uuid()}`;

    await this.orgRepository.create({id: orgId, name: domain || 'Local'});
    await this.orgRepository.addDomain(orgId, domain);
    await this.orgRepository.setDomainVerified(domain, true);
    await this.userRepository.create({
      email: input.email,
      emailVerified: true,
      id: userId,
      name: input.name,
    });
    await this.orgRepository.addMember(orgId, userId, 'admin');

    const created = await this.userRepository.findOneById(userId);

    if (!created) {
      throw new ConflictHttpError('Could not bootstrap the local organisation');
    }

    return created;
  }

  public async issueSession(user: UserRow): Promise<AuthResponseModel> {
    const membership = await this.orgRepository.findMembership(user.id);

    if (!membership) {
      throw new ForbiddenHttpError('This account does not belong to any organisation yet');
    }

    const org = await this.orgRepository.findOneById(membership.orgId);

    if (!org) {
      throw new ForbiddenHttpError('This account does not belong to any organisation yet');
    }

    if (org.status === 'suspended') {
      throw new ForbiddenHttpError('This organisation is suspended, contact your administrator');
    }

    const token = TokenService.generate();
    const expiresAt = new Date(
      Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    await this.sessionRepository.create(TokenService.hash(token), user.id, expiresAt);

    return {
      token,
      user: {
        email: user.email,
        id: user.id,
        isOrgAdmin: membership.role === 'admin',
        isPlatformAdmin: config.platformAdminEmails.includes(user.email.toLowerCase()),
        name: user.name,
        orgId: org.id,
        orgName: org.name,
        orgStatus: org.status,
        ...(user.pictureUrl ? {pictureUrl: user.pictureUrl} : {}),
      },
    };
  }

  public get invitations(): InvitationRepository {
    return this.invitationRepository;
  }
}
