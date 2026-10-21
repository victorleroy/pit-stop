import type {Db} from '~/Db/connection';
import type {RetroPhase} from '~/Db/schema';
import type {RetroRow} from '~/Repository/BoardRepository';
import type {ScopedDb} from '~/Security/ScopedDb';

const RETRO_COLUMNS = [
  'id',
  'orgId',
  'teamId',
  'title',
  'phase',
  'createdBy',
  'facilitatorId',
  'maxVotes',
  'timerEndsAt',
  'timerRemainingMs',
  'timerTotalMs',
  'createdAt',
] as const;

export interface CreateRetroInput {
  createdBy: string;
  id: string;
  orgId: string;
  teamId: string;
  title: string;
}

export interface UpdateRetroInput {
  facilitatorId?: string;
  phase?: RetroPhase;
  timerEndsAt?: string | null;
  timerRemainingMs?: number | null;
  timerTotalMs?: number | null;
  title?: string;
}

export class RetroRepository {
  public constructor(private readonly db: Db) {}

  /** Always goes through the scoped accessor: a retro of another org is simply not found. */
  public async findOneById(scoped: ScopedDb, retroId: string): Promise<RetroRow | undefined> {
    return scoped.retros().select(RETRO_COLUMNS).where('retros.id', '=', retroId).executeTakeFirst();
  }

  public async findAllByTeamId(scoped: ScopedDb, teamId: string): Promise<RetroRow[]> {
    return scoped
      .retros()
      .select(RETRO_COLUMNS)
      .where('retros.teamId', '=', teamId)
      .orderBy('retros.createdAt', 'desc')
      .execute();
  }

  public async findAllByTeamIds(scoped: ScopedDb, teamIds: string[]): Promise<RetroRow[]> {
    if (!teamIds.length) {
      return [];
    }

    return scoped
      .retros()
      .select(RETRO_COLUMNS)
      .where('retros.teamId', 'in', teamIds)
      .orderBy('retros.createdAt', 'desc')
      .execute();
  }

  public async create(input: CreateRetroInput): Promise<void> {
    await this.db
      .insertInto('retros')
      .values({
        createdAt: new Date().toISOString(),
        createdBy: input.createdBy,
        facilitatorId: input.createdBy,
        id: input.id,
        orgId: input.orgId,
        phase: 'BRAINSTORM',
        teamId: input.teamId,
        title: input.title,
      })
      .execute();
  }

  public async update(retroId: string, changes: UpdateRetroInput): Promise<void> {
    if (!Object.keys(changes).length) {
      return;
    }

    await this.db.updateTable('retros').set(changes).where('id', '=', retroId).execute();
  }

  public async countCreatedSince(orgId: string, since: string): Promise<number> {
    const row = await this.db
      .selectFrom('retros')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('orgId', '=', orgId)
      .where('createdAt', '>=', since)
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }
}
