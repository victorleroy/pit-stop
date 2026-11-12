import {v4 as uuid} from 'uuid';
import {BadRequestHttpError, ConflictHttpError, NotFoundHttpError} from '~/Error/HttpError';
import type {TeamTemplatesModel, TemplateModel} from '~/Model/TemplateModel';
import type {ColumnRepository} from '~/Repository/ColumnRepository';
import {templateNameKey} from '~/Repository/RetroTemplateRepository';
import type {
  RetroTemplateRepository,
  TemplateContent,
  TemplateRow,
} from '~/Repository/RetroTemplateRepository';
import type {AuthContext} from '~/Security/AuthContext';
import type {RetroAccessChecker} from '~/Security/RetroAccessChecker';
import type {RoleChecker} from '~/Security/RoleChecker';
import {ScopedDb} from '~/Security/ScopedDb';
import {
  BUILTIN_PREFIX,
  BUILTIN_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  findBuiltinTemplate,
} from '~/Template/builtinTemplates';
import type {BuiltinTemplate} from '~/Template/builtinTemplates';

/** A guard against abuse, not a plan limit: one count query protects a single instance. */
export const MAX_TEAM_TEMPLATES = 50;

export const MAX_TEMPLATE_COLUMNS = 8;

const MAX_NAME_LENGTH = 60;

/** What a retro copies from its template when it is created, and never reads again. */
export interface ResolvedTemplate extends TemplateContent {
  id: string;
}

export class RetroTemplateManager {
  public constructor(
    private readonly templateRepository: RetroTemplateRepository,
    private readonly columnRepository: ColumnRepository,
    private readonly accessChecker: RetroAccessChecker,
    private readonly roleChecker: RoleChecker,
  ) {}

  public async list(auth: AuthContext, teamId: string): Promise<TeamTemplatesModel> {
    await this.accessChecker.checkTeamAccess(auth, teamId);

    const [team, defaultTemplateId] = await Promise.all([
      this.templateRepository.findAllByTeamId(auth.db, teamId),
      this.effectiveDefault(auth.db, teamId),
    ]);

    return {
      builtin: BUILTIN_TEMPLATES.map(RetroTemplateManager.fromBuiltin),
      defaultTemplateId,
      team: team.map(RetroTemplateManager.fromRow),
    };
  }

  public async create(
    auth: AuthContext,
    teamId: string,
    content: TemplateContent,
  ): Promise<TemplateModel> {
    await this.checkTeamAdmin(auth, teamId);
    RetroTemplateManager.checkColumnTitles(content);

    return this.insert(auth, teamId, content);
  }

  /** Last write wins: "Last edited by" tells the next admin whose version they are reading. */
  public async update(
    auth: AuthContext,
    teamId: string,
    templateId: string,
    content: TemplateContent,
  ): Promise<TemplateModel> {
    await this.checkTeamAdmin(auth, teamId);
    RetroTemplateManager.checkColumnTitles(content);

    await auth.db.unscoped.transaction().execute(async (trx) => {
      const scoped = new ScopedDb(trx, auth.orgId);
      const current = await this.findTeamTemplate(scoped, teamId, templateId);

      if (templateNameKey(current.name) !== templateNameKey(content.name)) {
        await this.checkNameFree(scoped, teamId, content.name);
      }

      await this.templateRepository.replace(scoped, templateId, {...content, userId: auth.userId});
    });

    return this.read(auth, teamId, templateId);
  }

  /** Retros created from it keep their copy: nothing points back at the template. */
  public async remove(auth: AuthContext, teamId: string, templateId: string): Promise<void> {
    await this.checkTeamAdmin(auth, teamId);

    await auth.db.unscoped.transaction().execute(async (trx) => {
      const scoped = new ScopedDb(trx, auth.orgId);

      await this.findTeamTemplate(scoped, teamId, templateId);
      await this.templateRepository.clearTeamDefault(scoped, teamId, templateId);
      await this.templateRepository.remove(scoped, templateId);
    });
  }

  /**
   * The source is a classic, or a template of a team the caller belongs to. It is resolved by
   * a query restricted to those cases, so a template of a team they have not joined answers
   * exactly like one that does not exist.
   */
  public async duplicate(
    auth: AuthContext,
    teamId: string,
    sourceTemplateId: string,
    name?: string,
  ): Promise<TemplateModel> {
    await this.checkTeamAdmin(auth, teamId);

    const builtin = findBuiltinTemplate(sourceTemplateId);
    const source = builtin
      ? RetroTemplateManager.contentOf(builtin)
      : await this.templateRepository.findOneForMember(auth.db, auth.userId, sourceTemplateId);

    if (!source) {
      throw new NotFoundHttpError('Template not found');
    }

    const content = RetroTemplateManager.contentOf(source);

    if (name) {
      return this.insert(auth, teamId, {...content, name});
    }

    const taken = await this.templateRepository.findNameKeys(auth.db, teamId);

    return this.insert(auth, teamId, {
      ...content,
      name: RetroTemplateManager.copyName(source.name, taken),
    });
  }

  /**
   * The columns of a retro become a template. A board is freer than a template (no cap, no
   * unique titles), so what a template cannot hold is refused rather than silently changed.
   * The caller runs it in the retro's queue: the columns are read between two commands.
   */
  public async saveFromRetro(
    auth: AuthContext,
    retroId: string,
    input: {description: string | null; name: string},
  ): Promise<TemplateModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);

    await this.roleChecker.checkTeamAdmin(auth, retro.teamId);

    const columns = await this.columnRepository.findAllByRetroId(retroId);

    if (columns.length > MAX_TEMPLATE_COLUMNS) {
      throw new ConflictHttpError('A template holds at most 8 columns: remove some first');
    }

    if (RetroTemplateManager.hasDuplicateTitles(columns)) {
      throw new ConflictHttpError('Two columns have the same title: rename one first');
    }

    return this.insert(auth, retro.teamId, {
      actionReview: Boolean(retro.actionReview),
      columns: columns.map(({prompt, title}) => ({prompt, title})),
      description: input.description,
      // A question drawn, asked or not: the retro opens with an icebreaker.
      icebreaker: retro.icebreakerQuestionId !== null,
      maxVotes: retro.maxVotes,
      name: input.name,
      // The timer total reflects the last gesture on the clock (extended, stopped), not a
      // duration anybody proposed: it is not worth keeping.
      timerSeconds: null,
    });
  }

  public async setDefault(
    auth: AuthContext,
    teamId: string,
    templateId: string | null,
  ): Promise<{defaultTemplateId: string}> {
    await this.checkTeamAdmin(auth, teamId);

    if (templateId !== null && !findBuiltinTemplate(templateId)) {
      await this.findTeamTemplate(auth.db, teamId, templateId);
    }

    await this.templateRepository.setTeamDefault(auth.db, teamId, templateId);

    return {defaultTemplateId: templateId ?? DEFAULT_TEMPLATE_ID};
  }

  /**
   * What a new retro of the team copies: the given template, or the team default. The caller
   * has checked access to the team. A template of another team, of another organisation or
   * deleted meanwhile is not found.
   */
  public async resolve(
    auth: AuthContext,
    teamId: string,
    templateId?: string,
  ): Promise<ResolvedTemplate> {
    const id = templateId ?? (await this.effectiveDefault(auth.db, teamId));
    const builtin = findBuiltinTemplate(id);

    if (builtin) {
      return {...RetroTemplateManager.contentOf(builtin), id: builtin.id};
    }

    const row = id.startsWith(BUILTIN_PREFIX)
      ? undefined
      : await this.templateRepository.findOneByTeamId(auth.db, teamId, id);

    if (!row) {
      throw new NotFoundHttpError('Template not found');
    }

    return {...RetroTemplateManager.contentOf(row), id: row.id};
  }

  /** Never null: a default that no longer resolves falls back to Start / Stop / Continue. */
  private async effectiveDefault(scoped: ScopedDb, teamId: string): Promise<string> {
    const stored = await this.templateRepository.findTeamDefault(scoped, teamId);

    if (!stored) {
      return DEFAULT_TEMPLATE_ID;
    }

    if (findBuiltinTemplate(stored)) {
      return stored;
    }

    const row = stored.startsWith(BUILTIN_PREFIX)
      ? undefined
      : await this.templateRepository.findOneByTeamId(scoped, teamId, stored);

    return row ? stored : DEFAULT_TEMPLATE_ID;
  }

  /** Membership first, then the role, in the order of retro creation. */
  private async checkTeamAdmin(auth: AuthContext, teamId: string): Promise<void> {
    await this.accessChecker.checkTeamAccess(auth, teamId);
    await this.roleChecker.checkTeamAdmin(auth, teamId);
  }

  private async insert(
    auth: AuthContext,
    teamId: string,
    content: TemplateContent,
  ): Promise<TemplateModel> {
    const id = uuid();

    await auth.db.unscoped.transaction().execute(async (trx) => {
      const scoped = new ScopedDb(trx, auth.orgId);

      if ((await this.templateRepository.countByTeamId(scoped, teamId)) >= MAX_TEAM_TEMPLATES) {
        throw new ConflictHttpError('Template limit reached');
      }

      await this.checkNameFree(scoped, teamId, content.name);
      await this.templateRepository.create(scoped, {...content, id, teamId, userId: auth.userId});
    });

    return this.read(auth, teamId, id);
  }

  private async read(auth: AuthContext, teamId: string, templateId: string) {
    return RetroTemplateManager.fromRow(await this.findTeamTemplate(auth.db, teamId, templateId));
  }

  /** A classic belongs to no team: editing or deleting one is a 404 like any stranger. */
  private async findTeamTemplate(
    scoped: ScopedDb,
    teamId: string,
    templateId: string,
  ): Promise<TemplateRow> {
    const row = await this.templateRepository.findOneByTeamId(scoped, teamId, templateId);

    if (!row) {
      throw new NotFoundHttpError('Template not found');
    }

    return row;
  }

  private async checkNameFree(scoped: ScopedDb, teamId: string, name: string): Promise<void> {
    const taken = await this.templateRepository.findNameKeys(scoped, teamId);

    if (taken.has(templateNameKey(name))) {
      throw new ConflictHttpError('A template with this name already exists');
    }
  }

  private static checkColumnTitles(content: TemplateContent): void {
    if (RetroTemplateManager.hasDuplicateTitles(content.columns)) {
      throw new BadRequestHttpError('Two columns cannot have the same title');
    }
  }

  private static hasDuplicateTitles(columns: {title: string}[]): boolean {
    const keys = columns.map(({title}) => title.trim().toLowerCase());

    return new Set(keys).size !== keys.length;
  }

  /** "Retro (copy)", then "Retro (copy 2)"..., cut so the name still fits. */
  private static copyName(source: string, taken: Set<string>): string {
    for (let index = 1; ; index += 1) {
      const suffix = index === 1 ? ' (copy)' : ` (copy ${index})`;
      const name = `${source.slice(0, MAX_NAME_LENGTH - suffix.length).trim()}${suffix}`;

      if (!taken.has(templateNameKey(name))) {
        return name;
      }
    }
  }

  private static contentOf(source: BuiltinTemplate | TemplateContent): TemplateContent {
    return {
      actionReview: source.actionReview,
      columns: source.columns.map(({prompt, title}) => ({prompt, title})),
      description: source.description,
      icebreaker: source.icebreaker,
      maxVotes: source.maxVotes,
      name: source.name,
      timerSeconds: source.timerSeconds,
    };
  }

  private static fromBuiltin(template: BuiltinTemplate): TemplateModel {
    return {...RetroTemplateManager.contentOf(template), id: template.id, scope: 'BUILTIN'};
  }

  private static fromRow(row: TemplateRow): TemplateModel {
    return {
      ...RetroTemplateManager.contentOf(row),
      id: row.id,
      scope: 'TEAM',
      updatedAt: row.updatedAt,
      updatedBy: {id: row.updatedBy, name: row.updatedByName ?? ''},
    };
  }
}
