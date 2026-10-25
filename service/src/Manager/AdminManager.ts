import {ConflictHttpError, ForbiddenHttpError, NotFoundHttpError} from '~/Error/HttpError';
import type {OrgMemberModel, UserModel} from '~/Model/UserModel';
import type {MembershipRepository} from '~/Repository/MembershipRepository';
import type {OrgRepository} from '~/Repository/OrgRepository';
import type {RetroRepository} from '~/Repository/RetroRepository';
import type {SessionRepository} from '~/Repository/SessionRepository';
import type {AuthContext} from '~/Security/AuthContext';
import type {RetroAccessChecker} from '~/Security/RetroAccessChecker';
import type {RoleChecker} from '~/Security/RoleChecker';

/**
 * Just enough of the realtime layer for the facilitation rules: whether a given user is
 * currently watching a retro. Backed by the in-memory RetroSession registry, so presence is
 * read from the live connections rather than from a table that has to be kept true.
 */
export interface PresenceReader {
  isWatching(retroId: string, userId: string): boolean;
}

export class AdminManager {
  public constructor(
    private readonly orgRepository: OrgRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly retroRepository: RetroRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly accessChecker: RetroAccessChecker,
    private readonly roleChecker: RoleChecker,
    private readonly presence: PresenceReader,
  ) {}

  public async listOrgAdmins(auth: AuthContext): Promise<UserModel[]> {
    const members = await this.orgRepository.listMembers(auth.orgId);

    return members
      .filter((member) => member.role === 'admin')
      .map((member) => ({
        email: member.email,
        id: member.userId,
        isOrgAdmin: true,
        name: member.name,
        orgId: auth.orgId,
        ...(member.pictureUrl ? {pictureUrl: member.pictureUrl} : {}),
      }));
  }

  /**
   * Everybody in the organisation, with the teams they belong to. Read from the teams down
   * rather than from each person up: an organisation has far fewer teams than people.
   */
  public async listOrgMembers(auth: AuthContext): Promise<OrgMemberModel[]> {
    // Everybody may see who else is in the organisation, which is what makes it possible to
    // add somebody to a team. Which teams they belong to is another matter: teams are private
    // to their members, so only an organisation administrator gets the rosters.
    const isOrgAdmin = await this.roleChecker.isOrgAdmin(auth);

    const [members, rosters] = await Promise.all([
      this.orgRepository.listMembers(auth.orgId),
      isOrgAdmin ? this.membershipRepository.findAllByOrg(auth.orgId) : [],
    ]);

    const teamsByUser = new Map<string, OrgMemberModel['teams']>();

    for (const row of rosters) {
      teamsByUser.set(row.userId, [
        ...(teamsByUser.get(row.userId) ?? []),
        {id: row.teamId, isAdmin: Boolean(row.isAdmin), name: row.teamName},
      ]);
    }

    return members
      .map((member) => ({
        email: member.email,
        id: member.userId,
        isOrgAdmin: member.role === 'admin',
        name: member.name,
        orgId: auth.orgId,
        ...(member.pictureUrl ? {pictureUrl: member.pictureUrl} : {}),
        teams: (teamsByUser.get(member.userId) ?? []).sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  public async setOrgAdmin(auth: AuthContext, userId: string, isAdmin: boolean): Promise<void> {
    await this.roleChecker.checkOrgAdmin(auth);

    const membership = await this.orgRepository.findMembership(userId);

    if (!membership || membership.orgId !== auth.orgId) {
      throw new NotFoundHttpError(`User "${userId}" not found in this organisation`);
    }

    if (isAdmin) {
      await this.orgRepository.addMember(auth.orgId, userId, 'admin');
      return;
    }

    if (membership.role !== 'admin') {
      return;
    }

    // Never let the last administrator lock everybody out.
    if ((await this.orgRepository.countAdmins(auth.orgId)) <= 1) {
      throw new ConflictHttpError('The organisation needs at least one administrator');
    }

    await this.orgRepository.addMember(auth.orgId, userId, 'member');
  }

  /**
   * Anybody in the team can take the wheel while the facilitator is away: a retro should
   * never be stuck because one person did not show up.
   */
  public async takeFacilitation(auth: AuthContext, retroId: string): Promise<void> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);

    if (retro.facilitatorId === auth.userId) {
      return;
    }

    const isTeamAdmin = await this.roleChecker.isTeamAdmin(auth, retro.teamId);

    if (!isTeamAdmin && this.presence.isWatching(retroId, retro.facilitatorId)) {
      throw new ConflictHttpError('The facilitator is here, ask them to hand over');
    }

    await this.retroRepository.update(retroId, {facilitatorId: auth.userId});
  }

  public async handOverFacilitation(
    auth: AuthContext,
    retroId: string,
    userId: string,
  ): Promise<void> {
    const {isFacilitator, retro} = await this.accessChecker.checkRetroAccess(auth, retroId);

    if (!isFacilitator) {
      throw new ForbiddenHttpError('Only the facilitator can hand over');
    }

    const membership = await this.membershipRepository.findOne(retro.teamId, userId);

    if (!membership) {
      throw new ConflictHttpError('The new facilitator must be a member of the team');
    }

    await this.retroRepository.update(retroId, {facilitatorId: userId});
  }

  /** Removing somebody from the organisation must also cut their live sessions (ADR-001 D7). */
  public async revokeUserSessions(userId: string): Promise<void> {
    await this.sessionRepository.revokeAllForUser(userId);
  }
}
