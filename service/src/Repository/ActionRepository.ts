import type {Db} from '~/Db/connection';
import type {ActionStatus} from '~/Db/schema';
import type {ActionRow} from '~/Repository/BoardRepository';
import type {ScopedDb} from '~/Security/ScopedDb';

export class ActionRepository {
  public constructor(private readonly db: Db) {}

  public async findOneById(
    scoped: ScopedDb,
    actionId: string,
  ): Promise<(ActionRow & {teamId: string}) | undefined> {
    return scoped
      .actions()
      .leftJoin('retros', 'retros.id', 'actions.retroId')
      .leftJoin('users', 'users.id', 'actions.assigneeId')
      .select([
        'actions.id',
        'actions.assigneeId',
        'users.name as assigneeName',
        'actions.closedAt',
        'actions.createdAt',
        'actions.retroId',
        'retros.title as retroTitle',
        'actions.status',
        'actions.teamId',
        'actions.text',
      ])
      .where('actions.id', '=', actionId)
      .executeTakeFirst();
  }

  public async create(input: {
    assigneeId?: string;
    id: string;
    orgId: string;
    retroId: string;
    teamId: string;
    text: string;
  }): Promise<void> {
    await this.db
      .insertInto('actions')
      .values({
        assigneeId: input.assigneeId ?? null,
        createdAt: new Date().toISOString(),
        id: input.id,
        orgId: input.orgId,
        retroId: input.retroId,
        status: 'OPEN',
        teamId: input.teamId,
        text: input.text,
      })
      .execute();
  }

  /** `executor` lets a manager run the write inside its own transaction. */
  public async update(
    actionId: string,
    changes: {
      assigneeId?: string | null;
      closedAt?: string | null;
      status?: ActionStatus;
      text?: string;
    },
    executor: Db = this.db,
  ): Promise<void> {
    if (!Object.keys(changes).length) {
      return;
    }

    await executor.updateTable('actions').set(changes).where('id', '=', actionId).execute();
  }

  public async countOpen(scoped: ScopedDb, teamId: string): Promise<number> {
    const row = await scoped
      .actions()
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('actions.teamId', '=', teamId)
      .where('actions.status', '=', 'OPEN')
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }

  /** Closures since `since` (all recorded ones without it); closures before closed_at existed are not counted. */
  public async countClosedSince(
    scoped: ScopedDb,
    teamId: string,
    status: 'DONE' | 'DROPPED',
    since?: string,
  ): Promise<number> {
    let query = scoped
      .actions()
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('actions.teamId', '=', teamId)
      .where('actions.status', '=', status)
      .where('actions.closedAt', 'is not', null);

    if (since) {
      query = query.where('actions.closedAt', '>=', since);
    }

    const row = await query.executeTakeFirst();

    return Number(row?.total ?? 0);
  }
}
