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

  public async update(
    actionId: string,
    changes: {assigneeId?: string | null; status?: ActionStatus; text?: string},
  ): Promise<void> {
    if (!Object.keys(changes).length) {
      return;
    }

    await this.db.updateTable('actions').set(changes).where('id', '=', actionId).execute();
  }
}
