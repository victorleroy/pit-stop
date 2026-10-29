import type {ActionStatus} from '~/Db/schema';
import type {ScopedDb} from '~/Security/ScopedDb';

/**
 * Aggregates across every team of an organisation. Every query selects a COUNT and nothing
 * else: the org admin reading these has not necessarily joined the teams they come from.
 * `since` is an ISO timestamp, compared as text, which orders correctly for ISO strings;
 * null means all time.
 */
export class OrgStatsRepository {
  public async countPeople(scoped: ScopedDb): Promise<{admins: number; total: number}> {
    const rows = await scoped
      .orgMembers()
      .select((eb) => ['role', eb.fn.countAll<number>().as('total')])
      .groupBy('role')
      .execute();

    const admins = Number(rows.find((row) => row.role === 'admin')?.total ?? 0);
    const total = rows.reduce((sum, row) => sum + Number(row.total), 0);

    return {admins, total};
  }

  /**
   * Idle: created before `idleSince` and no retro created since, whatever the period being
   * looked at. A team younger than that has not had the time to be idle.
   */
  public async countTeams(
    scoped: ScopedDb,
    idleSince: string,
  ): Promise<{idle: number; total: number}> {
    const row = await scoped
      .teams()
      .select((eb) => [
        eb.fn.countAll<number>().as('total'),
        eb.fn
          .sum<number>(
            eb
              .case()
              .when(
                eb.and([
                  eb('teams.createdAt', '<', idleSince),
                  eb.not(
                    eb.exists(
                      eb
                        .selectFrom('retros')
                        .select('retros.id')
                        .whereRef('retros.teamId', '=', 'teams.id')
                        .where('retros.createdAt', '>=', idleSince),
                    ),
                  ),
                ]),
              )
              .then(1)
              .else(0)
              .end(),
          )
          .as('idle'),
      ])
      .executeTakeFirst();

    return {idle: Number(row?.idle ?? 0), total: Number(row?.total ?? 0)};
  }

  public async countRetros(scoped: ScopedDb, since: string | null): Promise<number> {
    let query = scoped.retros().select((eb) => eb.fn.countAll<number>().as('total'));

    if (since) {
      query = query.where('retros.createdAt', '>=', since);
    }

    return Number((await query.executeTakeFirst())?.total ?? 0);
  }

  /**
   * Notes carry no org_id: they are reached through their retro, which does. `retros` counts
   * the retros that received at least one of those notes.
   */
  public async countNotes(
    scoped: ScopedDb,
    since: string | null,
  ): Promise<{retros: number; total: number}> {
    let query = scoped
      .retros()
      .innerJoin('notes', 'notes.retroId', 'retros.id')
      .select((eb) => [
        eb.fn.countAll<number>().as('total'),
        eb.fn.count<number>('notes.retroId').distinct().as('retros'),
      ]);

    if (since) {
      query = query.where('notes.createdAt', '>=', since);
    }

    const row = await query.executeTakeFirst();

    return {retros: Number(row?.retros ?? 0), total: Number(row?.total ?? 0)};
  }

  public async countActionsByStatus(
    scoped: ScopedDb,
    since: string | null,
  ): Promise<Record<ActionStatus, number>> {
    let query = scoped
      .actions()
      .select((eb) => ['actions.status', eb.fn.countAll<number>().as('total')])
      .groupBy('actions.status');

    if (since) {
      query = query.where('actions.createdAt', '>=', since);
    }

    const counts: Record<ActionStatus, number> = {DONE: 0, DROPPED: 0, OPEN: 0};

    for (const row of await query.execute()) {
      counts[row.status] = Number(row.total);
    }

    return counts;
  }
}
