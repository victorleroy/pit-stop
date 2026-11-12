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
  'templateId',
  'templateName',
  'defaultTimerSeconds',
  'icebreakerQuestionId',
  'icebreakerAskedAt',
  'actionReview',
  'reviewFocusActionId',
] as const;

export interface CreateRetroInput {
  /** 0 or 1; left out, the column default (1) applies. */
  actionReview?: number;
  createdBy: string;
  defaultTimerSeconds?: number | null;
  /** Drawn, not asked yet: the question is asked on entering ICEBREAKER. */
  icebreakerQuestionId?: string | null;
  id: string;
  /** Left out, the column default (5) applies. */
  maxVotes?: number;
  orgId: string;
  teamId: string;
  templateId?: string | null;
  templateName?: string | null;
  title: string;
}

export interface UpdateRetroInput {
  actionReview?: number;
  facilitatorId?: string;
  icebreakerAskedAt?: string | null;
  icebreakerQuestionId?: string | null;
  maxVotes?: number;
  phase?: RetroPhase;
  reviewFocusActionId?: string | null;
  timerEndsAt?: string | null;
  timerRemainingMs?: number | null;
  timerTotalMs?: number | null;
  title?: string;
}

export interface IcebreakerUsage {
  askedAt: string | null;
  phase: RetroPhase;
  questionId: string;
  retroId: string;
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

  /** Narrows a list of retro ids, typically the live ones, to those of one team. */
  public async findIdsByTeamId(scoped: ScopedDb, teamId: string, retroIds: string[]): Promise<string[]> {
    if (!retroIds.length) {
      return [];
    }

    const rows = await scoped
      .retros()
      .select('retros.id')
      .where('retros.id', 'in', retroIds)
      .where('retros.teamId', '=', teamId)
      .execute();

    return rows.map(({id}) => id);
  }

  /**
   * The bank questions of the team's retros: the history of what was asked, and what the other
   * waiting rooms hold back. Derived from the retros themselves, never stored apart.
   */
  public async findIcebreakerUsage(scoped: ScopedDb, teamId: string): Promise<IcebreakerUsage[]> {
    const rows = await scoped
      .retros()
      .select([
        'retros.id',
        'retros.phase',
        'retros.icebreakerQuestionId as questionId',
        'retros.icebreakerAskedAt as askedAt',
      ])
      .where('retros.teamId', '=', teamId)
      .where('retros.icebreakerQuestionId', 'is not', null)
      .execute();

    return rows.map(({askedAt, id, phase, questionId}) => ({
      askedAt,
      phase,
      questionId: questionId as string,
      retroId: id,
    }));
  }

  /** Takes the caller's transaction: a retro and its columns are written together. */
  public async create(input: CreateRetroInput, executor: Db = this.db): Promise<void> {
    await executor
      .insertInto('retros')
      .values({
        ...(input.actionReview === undefined ? {} : {actionReview: input.actionReview}),
        createdAt: new Date().toISOString(),
        createdBy: input.createdBy,
        defaultTimerSeconds: input.defaultTimerSeconds ?? null,
        facilitatorId: input.createdBy,
        icebreakerQuestionId: input.icebreakerQuestionId ?? null,
        id: input.id,
        ...(input.maxVotes === undefined ? {} : {maxVotes: input.maxVotes}),
        orgId: input.orgId,
        phase: 'LOBBY',
        teamId: input.teamId,
        templateId: input.templateId ?? null,
        templateName: input.templateName ?? null,
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
