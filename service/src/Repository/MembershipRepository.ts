import type {Db} from '~/Db/connection';

export interface MembershipRow {
  createdAt: string;
  isAdmin: number;
  teamId: string;
  userId: string;
}

export interface TeamMemberRow extends MembershipRow {
  email: string;
  name: string;
  pictureUrl: string | null;
}

export interface UserTeamRow extends MembershipRow {
  teamName: string;
}

export class MembershipRepository {
  public constructor(private readonly db: Db) {}

  public async findOne(teamId: string, userId: string): Promise<MembershipRow | undefined> {
    return this.db
      .selectFrom('memberships')
      .selectAll()
      .where('teamId', '=', teamId)
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  /** Name, email and picture are joined from users, never copied. */
  public async findAllByTeamId(teamId: string): Promise<TeamMemberRow[]> {
    return this.db
      .selectFrom('memberships')
      .innerJoin('users', 'users.id', 'memberships.userId')
      .select([
        'memberships.teamId',
        'memberships.userId',
        'memberships.isAdmin',
        'memberships.createdAt',
        'users.email',
        'users.name',
        'users.pictureUrl',
      ])
      .where('memberships.teamId', '=', teamId)
      .orderBy('users.name')
      .execute();
  }

  public async findAllByUserId(userId: string, orgId: string): Promise<UserTeamRow[]> {
    return this.db
      .selectFrom('memberships')
      .innerJoin('teams', 'teams.id', 'memberships.teamId')
      .select([
        'memberships.teamId',
        'memberships.userId',
        'memberships.isAdmin',
        'memberships.createdAt',
        'teams.name as teamName',
      ])
      .where('memberships.userId', '=', userId)
      .where('teams.orgId', '=', orgId)
      .execute();
  }

  public async findAllByOrg(orgId: string): Promise<(UserTeamRow & {teamId: string})[]> {
    return this.db
      .selectFrom('memberships')
      .innerJoin('teams', 'teams.id', 'memberships.teamId')
      .select([
        'memberships.teamId',
        'memberships.userId',
        'memberships.isAdmin',
        'memberships.createdAt',
        'teams.name as teamName',
      ])
      .where('teams.orgId', '=', orgId)
      .execute();
  }

  public async upsert(input: {isAdmin: boolean; teamId: string; userId: string}): Promise<void> {
    await this.db
      .insertInto('memberships')
      .values({
        createdAt: new Date().toISOString(),
        isAdmin: input.isAdmin ? 1 : 0,
        teamId: input.teamId,
        userId: input.userId,
      })
      .onConflict((oc) =>
        oc.columns(['teamId', 'userId']).doUpdateSet({isAdmin: input.isAdmin ? 1 : 0}),
      )
      .execute();
  }

  public async remove(teamId: string, userId: string): Promise<void> {
    await this.db
      .deleteFrom('memberships')
      .where('teamId', '=', teamId)
      .where('userId', '=', userId)
      .execute();
  }
}
