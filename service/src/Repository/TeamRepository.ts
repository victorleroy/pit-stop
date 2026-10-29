import type {Db} from '~/Db/connection';
import type {ScopedDb} from '~/Security/ScopedDb';

export interface TeamRow {
  createdAt: string;
  createdBy: string;
  id: string;
  memberCount: number | null;
  name: string;
}

/** memberCount is derived with a subquery: a stored counter is a staleness bug waiting. */
const withMemberCount = (scoped: ScopedDb) =>
  scoped
    .teams()
    .select((eb) => [
      'teams.id',
      'teams.name',
      'teams.createdBy',
      'teams.createdAt',
      eb
        .selectFrom('memberships')
        .select((inner) => inner.fn.countAll<number>().as('c'))
        .whereRef('memberships.teamId', '=', 'teams.id')
        .as('memberCount'),
    ]);

export class TeamRepository {
  public constructor(private readonly db: Db) {}

  public async findOneById(scoped: ScopedDb, teamId: string): Promise<TeamRow | undefined> {
    return withMemberCount(scoped).where('teams.id', '=', teamId).executeTakeFirst();
  }

  public async findAllByOrg(scoped: ScopedDb): Promise<TeamRow[]> {
    return withMemberCount(scoped).orderBy('teams.name').execute();
  }

  /** Teams are private to their members, so this is what an ordinary member may list. */
  public async findAllByUserId(scoped: ScopedDb, userId: string): Promise<TeamRow[]> {
    return withMemberCount(scoped)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('memberships')
            .select('memberships.teamId')
            .whereRef('memberships.teamId', '=', 'teams.id')
            .where('memberships.userId', '=', userId),
        ),
      )
      .orderBy('teams.name')
      .execute();
  }

  public async create(input: {
    createdBy: string;
    id: string;
    name: string;
    orgId: string;
  }): Promise<void> {
    await this.db
      .insertInto('teams')
      .values({...input, createdAt: new Date().toISOString()})
      .execute();
  }

  public async rename(scoped: ScopedDb, teamId: string, name: string): Promise<void> {
    await scoped.unscoped
      .updateTable('teams')
      .set({name})
      .where('id', '=', teamId)
      .where('orgId', '=', scoped.orgId)
      .execute();
  }

  /** Retros, their boards, actions and memberships go with it: ON DELETE CASCADE. */
  public async remove(scoped: ScopedDb, teamId: string): Promise<void> {
    await scoped.unscoped
      .deleteFrom('teams')
      .where('id', '=', teamId)
      .where('orgId', '=', scoped.orgId)
      .execute();
  }

  public async findRetroIds(scoped: ScopedDb, teamId: string): Promise<string[]> {
    const rows = await scoped.retros().select('id').where('teamId', '=', teamId).execute();

    return rows.map((row) => row.id);
  }

  /** Counters only: what an org admin sees before deleting a team they may not have joined. */
  public async countContent(
    scoped: ScopedDb,
    teamId: string,
  ): Promise<{actionCount: number; retroCount: number}> {
    const [retros, actions] = await Promise.all([
      scoped
        .retros()
        .select((eb) => eb.fn.countAll<number>().as('total'))
        .where('teamId', '=', teamId)
        .executeTakeFirst(),
      scoped
        .actions()
        .select((eb) => eb.fn.countAll<number>().as('total'))
        .where('teamId', '=', teamId)
        .executeTakeFirst(),
    ]);

    return {actionCount: Number(actions?.total ?? 0), retroCount: Number(retros?.total ?? 0)};
  }

  public async countByOrg(orgId: string): Promise<number> {
    const row = await this.db
      .selectFrom('teams')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('orgId', '=', orgId)
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }
}
