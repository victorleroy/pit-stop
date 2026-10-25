import {hash as argonHash} from '@node-rs/argon2';
import {v4 as uuid} from 'uuid';
import {config} from '~/config';
import type {OrgRole} from '~/Db/schema';
import {
  ConflictHttpError,
  ForbiddenHttpError,
  NotFoundHttpError,
  TooManyRequestsHttpError,
} from '~/Error/HttpError';
import {invitationEmail} from '~/Mail/templates';
import type {Mailer} from '~/Mail/Mailer';
import type {InvitationModel} from '~/Model/UserModel';
import type {InvitationRepository, InvitationRow} from '~/Repository/InvitationRepository';
import type {OrgRepository} from '~/Repository/OrgRepository';
import type {SessionRepository} from '~/Repository/SessionRepository';
import type {UserRepository} from '~/Repository/UserRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {checkSeatAvailable, planFor} from '~/Security/Plans';
import type {RoleChecker} from '~/Security/RoleChecker';
import {TokenService} from '~/Security/TokenService';

export interface AcceptInput {
  name?: string;
  password?: string;
  token: string;
  /** Set when an already signed-in user accepts. */
  userId?: string;
}

/**
 * One invitation mechanism, two levels of use (ADR-001 D12): the platform admin invites the first
 * administrator of a customer organisation, an org admin invites their colleagues.
 */
export class InvitationManager {
  public constructor(
    private readonly invitationRepository: InvitationRepository,
    private readonly orgRepository: OrgRepository,
    private readonly userRepository: UserRepository,
    private readonly roleChecker: RoleChecker,
    private readonly mailer: Mailer,
    private readonly sessionRepository: SessionRepository,
  ) {}

  public async invite(
    auth: AuthContext,
    email: string,
    role: OrgRole = 'member',
  ): Promise<InvitationModel> {
    await this.roleChecker.checkOrgAdmin(auth);

    return this.issue({
      email,
      invitedBy: auth.userId,
      inviterName: auth.name,
      orgId: auth.orgId,
      role,
    });
  }

  /**
   * Shared by the org-admin path and the paddock. The daily ceiling protects the sender
   * reputation and the provider allowance as much as it protects against abuse.
   */
  public async issue(input: {
    email: string;
    invitedBy: string;
    inviterName: string;
    orgId: string;
    role: OrgRole;
  }): Promise<InvitationModel> {
    const org = await this.orgRepository.findOneById(input.orgId);

    if (!org) {
      throw new NotFoundHttpError(`Organisation "${input.orgId}" not found`);
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sent = await this.invitationRepository.countSince(input.orgId, since);

    if (sent >= planFor(org.status).invitationsPerDay) {
      throw new TooManyRequestsHttpError('Daily invitation limit reached for this organisation');
    }

    const token = TokenService.generate();
    const id = `inv_${uuid()}`;
    const expiresAt = new Date(
      Date.now() + config.invitationTtlDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    await this.invitationRepository.create({
      email: input.email,
      expiresAt,
      id,
      invitedBy: input.invitedBy,
      orgId: input.orgId,
      role: input.role,
      tokenHash: TokenService.hash(token),
    });

    try {
      await this.mailer.send({
        ...invitationEmail(org.name, input.inviterName, token),
        to: input.email,
      });
    } catch (error: unknown) {
      // An invitation nobody received must not linger as pending, nor count against the day.
      await this.invitationRepository.remove(id);
      throw error;
    }

    return {
      createdAt: new Date().toISOString(),
      email: input.email.toLowerCase(),
      expiresAt,
      id,
      role: input.role,
      status: 'pending',
    };
  }

  /**
   * Accepting binds the email: an invitation addressed to alice@acme.com cannot be redeemed
   * while signed in as bob@gmail.com. Without that rule, forwarding a mail is an org breach.
   *
   * Receiving the token proves control of the mailbox, so acceptance also stands in for email
   * verification on the invited path.
   */
  public async accept(input: AcceptInput): Promise<{orgId: string; userId: string}> {
    const invitation = await this.invitationRepository.findByTokenHash(
      TokenService.hash(input.token),
    );

    InvitationManager.checkUsable(invitation);

    const usable = invitation as InvitationRow;
    const existing = input.userId
      ? await this.userRepository.findOneById(input.userId)
      : await this.userRepository.findOneByEmail(usable.email);

    if (existing && existing.email.toLowerCase() !== usable.email.toLowerCase()) {
      throw new ForbiddenHttpError('This invitation was sent to another email address');
    }

    // A proven account accepts once signed in, with its own credentials: nobody holding the
    // link gets to choose a password for it.
    if (existing?.emailVerifiedAt && !input.userId) {
      throw new ConflictHttpError(
        'An account already exists for this address: sign in, then open the invitation again',
      );
    }

    const membership = existing ? await this.orgRepository.findMembership(existing.id) : undefined;

    // One organisation per account in v1: a second membership would leave the organisation a
    // session resolves to up to the database.
    if (membership && membership.orgId !== usable.orgId) {
      throw new ConflictHttpError('This account already belongs to another organisation');
    }

    if (!membership) {
      await checkSeatAvailable(this.orgRepository, usable.orgId);
    }

    // An unproven account is somebody else's registration attempt: the invitation proves the
    // address, so it is taken over, with its password and sessions dropped.
    const reclaimed = existing && !existing.emailVerifiedAt && !input.userId ? existing : undefined;

    if (reclaimed) {
      await this.userRepository.removeCredential(reclaimed.id, 'password');
      await this.sessionRepository.revokeAllForUser(reclaimed.id);
    }

    const userId = existing?.id ?? `usr_${uuid()}`;

    if (!existing || reclaimed) {
      if (!input.name || !input.password) {
        throw new ConflictHttpError('A name and a password are required to create the account');
      }

      if (reclaimed) {
        await this.userRepository.updateProfile(userId, {name: input.name});
        await this.userRepository.markEmailVerified(userId);
      } else {
        await this.userRepository.create({
          email: usable.email,
          emailVerified: true,
          id: userId,
          name: input.name,
        });
      }

      await this.userRepository.upsertCredential({
        kind: 'password',
        passwordHash: await argonHash(input.password),
        userId,
      });
    } else {
      await this.userRepository.markEmailVerified(userId);
    }

    await this.orgRepository.addMember(usable.orgId, userId, usable.role);
    await this.invitationRepository.markAccepted(usable.id);

    return {orgId: usable.orgId, userId};
  }

  public async list(auth: AuthContext): Promise<InvitationModel[]> {
    await this.roleChecker.checkOrgAdmin(auth);

    const rows = await this.invitationRepository.listByOrg(auth.orgId);

    return rows.map(InvitationManager.toModel);
  }

  public async revoke(auth: AuthContext, invitationId: string): Promise<void> {
    await this.roleChecker.checkOrgAdmin(auth);

    const invitation = await auth.db
      .invitations()
      .select('id')
      .where('invitations.id', '=', invitationId)
      .executeTakeFirst();

    if (!invitation) {
      throw new NotFoundHttpError(`Invitation "${invitationId}" not found`);
    }

    await this.invitationRepository.revoke(invitationId);
  }

  private static checkUsable(invitation?: InvitationRow): void {
    if (!invitation) {
      throw new NotFoundHttpError('This invitation is not valid');
    }

    if (invitation.revokedAt) {
      throw new ConflictHttpError('This invitation was revoked');
    }

    if (invitation.acceptedAt) {
      throw new ConflictHttpError('This invitation was already used');
    }

    if (invitation.expiresAt <= new Date().toISOString()) {
      throw new ConflictHttpError('This invitation has expired');
    }
  }

  private static toModel(row: InvitationRow): InvitationModel {
    const status = row.revokedAt
      ? 'revoked'
      : row.acceptedAt
        ? 'accepted'
        : row.expiresAt <= new Date().toISOString()
          ? 'expired'
          : 'pending';

    return {
      createdAt: row.createdAt,
      email: row.email,
      expiresAt: row.expiresAt,
      id: row.id,
      role: row.role,
      status,
    };
  }
}
