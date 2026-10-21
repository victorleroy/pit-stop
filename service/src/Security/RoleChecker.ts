import {ForbiddenHttpError} from '~/Error/HttpError';
import type {AuthContext} from '~/Security/AuthContext';

/**
 * Two levels of privilege inside an organisation: organisation administrators and team
 * administrators. Roles are read from the store on every call, never carried in the token:
 * demoting somebody has to take effect immediately, not in twelve hours.
 */
export class RoleChecker {
  public async isOrgAdmin(auth: AuthContext): Promise<boolean> {
    const row = await auth.db
      .orgMembers()
      .select('role')
      .where('userId', '=', auth.userId)
      .executeTakeFirst();

    return row?.role === 'admin';
  }

  public async isTeamAdmin(auth: AuthContext, teamId: string): Promise<boolean> {
    const membership = await auth.db.unscoped
      .selectFrom('memberships')
      .innerJoin('teams', 'teams.id', 'memberships.teamId')
      .select('memberships.isAdmin')
      .where('memberships.teamId', '=', teamId)
      .where('memberships.userId', '=', auth.userId)
      .where('teams.orgId', '=', auth.orgId)
      .executeTakeFirst();

    if (membership?.isAdmin) {
      return true;
    }

    // An org admin administers every team of their organisation, and only of theirs.
    const team = await auth.db.teams().select('id').where('id', '=', teamId).executeTakeFirst();

    return Boolean(team) && this.isOrgAdmin(auth);
  }

  public async checkOrgAdmin(auth: AuthContext): Promise<void> {
    if (!(await this.isOrgAdmin(auth))) {
      throw new ForbiddenHttpError('Only an organisation administrator can do this');
    }
  }

  public async checkTeamAdmin(auth: AuthContext, teamId: string): Promise<void> {
    if (!(await this.isTeamAdmin(auth, teamId))) {
      throw new ForbiddenHttpError('Only a team administrator can do this');
    }
  }
}
