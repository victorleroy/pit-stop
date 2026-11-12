import type {ScopedDb} from '~/Security/ScopedDb';

export interface TemplateColumnRow {
  prompt: string | null;
  title: string;
}

export interface TemplateRow {
  actionReview: boolean | null;
  columns: TemplateColumnRow[];
  description: string | null;
  icebreaker: boolean | null;
  id: string;
  maxVotes: number | null;
  name: string;
  teamId: string;
  timerSeconds: number | null;
  updatedAt: string;
  updatedBy: string;
  /** Joined from `users`, so a rename shows; empty once the account is gone. */
  updatedByName: string | null;
}

export interface TemplateContent {
  /** Whether its retros review the open actions; null leaves it to the new retro dialog. */
  actionReview: boolean | null;
  columns: TemplateColumnRow[];
  description: string | null;
  /** Whether its retros open with an icebreaker; null leaves it to the new retro dialog. */
  icebreaker: boolean | null;
  maxVotes: number | null;
  name: string;
  timerSeconds: number | null;
}

const toFlag = (value: number | null): boolean | null => (value === null ? null : Boolean(value));

const fromFlag = (value: boolean | null): number | null => (value === null ? null : Number(value));

/** What the unique index compares: one name per team, whatever the case. */
export const templateNameKey = (name: string): string => name.trim().toLowerCase();

/**
 * Every read goes through `ScopedDb.retroTemplates()`, so a template of another organisation
 * is never found. The columns are a child table without org_id, read only for templates that
 * came back from the scoped accessor. Writes take the scope of the caller's transaction.
 */
export class RetroTemplateRepository {
  private static selectTemplates(scoped: ScopedDb) {
    return scoped
      .retroTemplates()
      .leftJoin('users', 'users.id', 'retroTemplates.updatedBy')
      .select([
        'retroTemplates.id',
        'retroTemplates.teamId',
        'retroTemplates.name',
        'retroTemplates.description',
        'retroTemplates.maxVotes',
        'retroTemplates.timerSeconds',
        'retroTemplates.icebreaker',
        'retroTemplates.actionReview',
        'retroTemplates.updatedAt',
        'retroTemplates.updatedBy',
        'users.name as updatedByName',
      ]);
  }

  private static async withColumns(
    scoped: ScopedDb,
    rows: (Omit<TemplateRow, 'actionReview' | 'columns' | 'icebreaker'> & {
      actionReview: number | null;
      icebreaker: number | null;
    })[],
  ): Promise<TemplateRow[]> {
    if (!rows.length) {
      return [];
    }

    const columns = await scoped.unscoped
      .selectFrom('retroTemplateColumns')
      .select(['templateId', 'title', 'prompt'])
      .where(
        'templateId',
        'in',
        rows.map(({id}) => id),
      )
      .orderBy('position')
      .execute();

    return rows.map((row) => ({
      ...row,
      actionReview: toFlag(row.actionReview),
      icebreaker: toFlag(row.icebreaker),
      columns: columns
        .filter(({templateId}) => templateId === row.id)
        .map(({prompt, title}) => ({prompt, title})),
    }));
  }

  public async findAllByTeamId(scoped: ScopedDb, teamId: string): Promise<TemplateRow[]> {
    const rows = await RetroTemplateRepository.selectTemplates(scoped)
      .where('retroTemplates.teamId', '=', teamId)
      .orderBy('retroTemplates.nameKey')
      .execute();

    return RetroTemplateRepository.withColumns(scoped, rows);
  }

  public async findOneByTeamId(
    scoped: ScopedDb,
    teamId: string,
    templateId: string,
  ): Promise<TemplateRow | undefined> {
    const row = await RetroTemplateRepository.selectTemplates(scoped)
      .where('retroTemplates.teamId', '=', teamId)
      .where('retroTemplates.id', '=', templateId)
      .executeTakeFirst();

    return row && (await RetroTemplateRepository.withColumns(scoped, [row]))[0];
  }

  /**
   * A template of any team of the organisation the user belongs to, whatever their role
   * there. Anything else is not found: the existence of a template is no business of
   * someone outside its team.
   */
  public async findOneForMember(
    scoped: ScopedDb,
    userId: string,
    templateId: string,
  ): Promise<TemplateRow | undefined> {
    const row = await RetroTemplateRepository.selectTemplates(scoped)
      .where('retroTemplates.id', '=', templateId)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('memberships')
            .select('memberships.teamId')
            .whereRef('memberships.teamId', '=', 'retroTemplates.teamId')
            .where('memberships.userId', '=', userId),
        ),
      )
      .executeTakeFirst();

    return row && (await RetroTemplateRepository.withColumns(scoped, [row]))[0];
  }

  public async findNameKeys(scoped: ScopedDb, teamId: string): Promise<Set<string>> {
    const rows = await scoped
      .retroTemplates()
      .select('nameKey')
      .where('teamId', '=', teamId)
      .execute();

    return new Set(rows.map(({nameKey}) => nameKey));
  }

  public async countByTeamId(scoped: ScopedDb, teamId: string): Promise<number> {
    const row = await scoped
      .retroTemplates()
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('teamId', '=', teamId)
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }

  public async create(
    scoped: ScopedDb,
    input: TemplateContent & {id: string; teamId: string; userId: string},
  ): Promise<void> {
    const now = new Date().toISOString();

    await scoped.unscoped
      .insertInto('retroTemplates')
      .values({
        actionReview: fromFlag(input.actionReview),
        createdAt: now,
        createdBy: input.userId,
        description: input.description,
        icebreaker: fromFlag(input.icebreaker),
        id: input.id,
        maxVotes: input.maxVotes,
        name: input.name,
        nameKey: templateNameKey(input.name),
        orgId: scoped.orgId,
        teamId: input.teamId,
        timerSeconds: input.timerSeconds,
        updatedAt: now,
        updatedBy: input.userId,
      })
      .execute();

    await RetroTemplateRepository.insertColumns(scoped, input.id, input.columns);
  }

  /** A full replacement: the columns are deleted and written again. */
  public async replace(
    scoped: ScopedDb,
    templateId: string,
    input: TemplateContent & {userId: string},
  ): Promise<void> {
    await scoped.unscoped
      .updateTable('retroTemplates')
      .set({
        actionReview: fromFlag(input.actionReview),
        description: input.description,
        icebreaker: fromFlag(input.icebreaker),
        maxVotes: input.maxVotes,
        name: input.name,
        nameKey: templateNameKey(input.name),
        timerSeconds: input.timerSeconds,
        updatedAt: new Date().toISOString(),
        updatedBy: input.userId,
      })
      .where('id', '=', templateId)
      .where('orgId', '=', scoped.orgId)
      .execute();

    await scoped.unscoped
      .deleteFrom('retroTemplateColumns')
      .where('templateId', '=', templateId)
      .execute();

    await RetroTemplateRepository.insertColumns(scoped, templateId, input.columns);
  }

  public async remove(scoped: ScopedDb, templateId: string): Promise<void> {
    await scoped.unscoped
      .deleteFrom('retroTemplates')
      .where('id', '=', templateId)
      .where('orgId', '=', scoped.orgId)
      .execute();
  }

  public async findTeamDefault(scoped: ScopedDb, teamId: string): Promise<string | null> {
    const row = await scoped
      .teams()
      .select('defaultTemplateId')
      .where('id', '=', teamId)
      .executeTakeFirst();

    return row?.defaultTemplateId ?? null;
  }

  public async setTeamDefault(
    scoped: ScopedDb,
    teamId: string,
    templateId: string | null,
  ): Promise<void> {
    await scoped.unscoped
      .updateTable('teams')
      .set({defaultTemplateId: templateId})
      .where('id', '=', teamId)
      .where('orgId', '=', scoped.orgId)
      .execute();
  }

  /** A deleted template stops being the default in the same transaction (ADR 0004 D4). */
  public async clearTeamDefault(scoped: ScopedDb, teamId: string, templateId: string) {
    await scoped.unscoped
      .updateTable('teams')
      .set({defaultTemplateId: null})
      .where('id', '=', teamId)
      .where('orgId', '=', scoped.orgId)
      .where('defaultTemplateId', '=', templateId)
      .execute();
  }

  private static async insertColumns(
    scoped: ScopedDb,
    templateId: string,
    columns: TemplateColumnRow[],
  ): Promise<void> {
    if (!columns.length) {
      return;
    }

    await scoped.unscoped
      .insertInto('retroTemplateColumns')
      .values(
        columns.map(({prompt, title}, position) => ({position, prompt, templateId, title})),
      )
      .execute();
  }
}
