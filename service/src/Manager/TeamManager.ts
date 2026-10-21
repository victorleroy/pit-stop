import {v4 as uuid} from 'uuid';
import {ConflictHttpError, ForbiddenHttpError, NotFoundHttpError} from '~/Error/HttpError';
import type {TeamMemberModel, TeamModel} from '~/Model/TeamModel';
import type {MembershipRepository} from '~/Repository/MembershipRepository';
import type {TeamRepository, TeamRow} from '~/Repository/TeamRepository';
import type {AuthContext} from '~/Security/AuthContext';
import type {RoleChecker} from '~/Security/RoleChecker';

export class TeamManager {
  public constructor(
    private readonly teamRepository: TeamRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly roleChecker: RoleChecker,
  ) {}

  /**
   * A team is visible to its members, and to organisation administrators because they
   * administer it. Everybody else does not learn that it exists: a team's retros are readable
   * by its members, so an open directory would make the boundary between teams cosmetic.
   */
  public async listTeams(auth: AuthContext): Promise<TeamModel[]> {
    const isOrgAdmin = await this.roleChecker.isOrgAdmin(auth);

    const [teams, memberships] = await Promise.all([
      isOrgAdmin
        ? this.teamRepository.findAllByOrg(auth.db)
        : this.teamRepository.findAllByUserId(auth.db, auth.userId),
      this.membershipRepository.findAllByUserId(auth.userId, auth.orgId),
    ]);

    const joined = new Map(memberships.map((membership) => [membership.teamId, membership]));

    return teams
      .map((team) => ({
        createdAt: team.createdAt,
        createdBy: team.createdBy,
        id: team.id,
        isAdmin: isOrgAdmin || Boolean(joined.get(team.id)?.isAdmin),
        isMember: joined.has(team.id),
        memberCount: Number(team.memberCount),
        name: team.name,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  public async createTeam(auth: AuthContext, name: string): Promise<TeamModel> {
    const id = uuid();

    await this.teamRepository.create({createdBy: auth.userId, id, name, orgId: auth.orgId});

    // Whoever creates the team administers it.
    await this.membershipRepository.upsert({isAdmin: true, teamId: id, userId: auth.userId});

    const team = await this.getOrgTeam(auth, id);

    return {
      createdAt: team.createdAt,
      createdBy: team.createdBy,
      id: team.id,
      isAdmin: true,
      isMember: true,
      memberCount: 1,
      name: team.name,
    };
  }

  /**
   * You are in a team because one of its administrators put you there. There is no
   * self-service join: the team is the confidentiality boundary around a board, and a boundary
   * anybody may cross on their own is not one.
   */
  public async addMember(auth: AuthContext, teamId: string, userId: string): Promise<void> {
    // Existence check first: a team of another organisation is a 404, never a 403.
    await this.getOrgTeam(auth, teamId);
    await this.checkTeamAdminMembership(auth, teamId);

    const inOrg = await auth.db
      .orgMembers()
      .select('userId')
      .where('userId', '=', userId)
      .executeTakeFirst();

    if (!inOrg) {
      throw new NotFoundHttpError(`User "${userId}" is not a member of this organisation`);
    }

    const existing = await this.membershipRepository.findOne(teamId, userId);

    await this.membershipRepository.upsert({
      isAdmin: Boolean(existing?.isAdmin),
      teamId,
      userId,
    });
  }

  public async removeMember(auth: AuthContext, teamId: string, userId: string): Promise<void> {
    await this.getOrgTeam(auth, teamId);
    await this.checkTeamAdminMembership(auth, teamId);

    // Removing yourself goes through leaveTeam, which carries the guard against leaving the
    // team with no administrator at all.
    if (userId === auth.userId) {
      await this.leaveTeam(auth, teamId);
      return;
    }

    const membership = await this.membershipRepository.findOne(teamId, userId);

    if (!membership) {
      throw new NotFoundHttpError(`User "${userId}" is not a member of this team`);
    }

    await this.membershipRepository.remove(teamId, userId);
  }

  /** Promoting or demoting a team administrator. */
  public async setMemberAdmin(
    auth: AuthContext,
    teamId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<void> {
    await this.getOrgTeam(auth, teamId);
    await this.roleChecker.checkTeamAdmin(auth, teamId);

    const membership = await this.membershipRepository.findOne(teamId, userId);

    if (!membership) {
      throw new NotFoundHttpError(`User "${userId}" is not a member of this team`);
    }

    if (!isAdmin && userId === auth.userId && !(await this.roleChecker.isOrgAdmin(auth))) {
      throw new ConflictHttpError('Ask another administrator to demote you');
    }

    await this.membershipRepository.upsert({isAdmin, teamId, userId});
  }

  public async leaveTeam(auth: AuthContext, teamId: string): Promise<void> {
    await this.getOrgTeam(auth, teamId);
    const existing = await this.membershipRepository.findOne(teamId, auth.userId);

    if (!existing) {
      throw new ConflictHttpError('You are not a member of this team');
    }

    // Leaving must not strand a team without anybody able to run a retro.
    if (existing.isAdmin) {
      const members = await this.membershipRepository.findAllByTeamId(teamId);
      const otherAdmins = members.filter(({isAdmin, userId}) => isAdmin && userId !== auth.userId);

      if (members.length > 1 && otherAdmins.length === 0) {
        throw new ConflictHttpError(
          'Name another administrator before leaving, the team would have none',
        );
      }
    }

    await this.membershipRepository.remove(teamId, auth.userId);
  }

  public async listMembers(auth: AuthContext, teamId: string): Promise<TeamMemberModel[]> {
    await this.getOrgTeam(auth, teamId);

    const membership = await this.membershipRepository.findOne(teamId, auth.userId);

    if (!membership && !(await this.roleChecker.isOrgAdmin(auth))) {
      throw new ForbiddenHttpError('You are not a member of this team');
    }

    const memberships = await this.membershipRepository.findAllByTeamId(teamId);

    return memberships
      .map((membership) => ({
        email: membership.email,
        isAdmin: Boolean(membership.isAdmin),
        joinedAt: membership.createdAt,
        name: membership.name,
        ...(membership.pictureUrl ? {pictureUrl: membership.pictureUrl} : {}),
        userId: membership.userId,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  /**
   * Deliberately the caller's own `memberships.is_admin`, not RoleChecker.isTeamAdmin, which
   * also answers true for organisation administrators. An org admin adding themselves to a
   * team would walk straight through the boundary this class exists to hold.
   */
  private async checkTeamAdminMembership(auth: AuthContext, teamId: string): Promise<void> {
    const membership = await this.membershipRepository.findOne(teamId, auth.userId);

    if (!membership?.isAdmin) {
      throw new ForbiddenHttpError('Only an administrator of this team can do this');
    }
  }

  private async getOrgTeam(auth: AuthContext, teamId: string): Promise<TeamRow> {
    const team = await this.teamRepository.findOneById(auth.db, teamId);

    if (!team) {
      throw new NotFoundHttpError(`Team "${teamId}" not found`);
    }

    return team;
  }
}
