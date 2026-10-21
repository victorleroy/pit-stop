import {v4 as uuid} from 'uuid';
import type {ActionStatus, RetroPhase} from '~/Db/schema';
import {ConflictHttpError, NotFoundHttpError} from '~/Error/HttpError';
import {RetroManager} from '~/Manager/RetroManager';
import type {ActionModel} from '~/Model/ActionModel';
import type {ActionRepository} from '~/Repository/ActionRepository';
import type {BoardRepository} from '~/Repository/BoardRepository';
import type {MembershipRepository} from '~/Repository/MembershipRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {RetroAccessChecker} from '~/Security/RetroAccessChecker';

const DECIDING_PHASES: RetroPhase[] = ['DISCUSS'];

export class ActionManager {
  public constructor(
    private readonly actionRepository: ActionRepository,
    private readonly boardRepository: BoardRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly accessChecker: RetroAccessChecker,
  ) {}

  public async listByTeam(auth: AuthContext, teamId: string): Promise<ActionModel[]> {
    await this.accessChecker.checkTeamAccess(auth, teamId);
    const actions = await this.boardRepository.findTeamActions(teamId);

    return actions.map(RetroManager.toActionModel);
  }

  public async create(
    auth: AuthContext,
    retroId: string,
    text: string,
    assigneeId?: string,
  ): Promise<ActionModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, DECIDING_PHASES);

    await this.checkAssignee(retro.teamId, assigneeId);

    const id = uuid();

    await this.actionRepository.create({
      ...(assigneeId ? {assigneeId} : {}),
      id,
      orgId: auth.orgId,
      retroId,
      teamId: retro.teamId,
      text,
    });

    const created = await this.actionRepository.findOneById(auth.db, id);

    if (!created) {
      throw new ConflictHttpError(`Action "${id}" could not be created`);
    }

    return RetroManager.toActionModel(created);
  }

  /** Reviewing an action is not tied to a retro phase: it happens whenever the team wants. */
  /** The retro whose queue an edit of this action has to go through, if it still has one. */
  public async findRetroId(
    auth: AuthContext,
    teamId: string,
    actionId: string,
  ): Promise<string | null> {
    await this.accessChecker.checkTeamAccess(auth, teamId);

    const action = await this.actionRepository.findOneById(auth.db, actionId);

    if (!action || action.teamId !== teamId) {
      throw new NotFoundHttpError(`Action "${actionId}" not found`);
    }

    return action.retroId;
  }

  public async update(
    auth: AuthContext,
    teamId: string,
    actionId: string,
    changes: {assigneeId?: string | null; status?: ActionStatus; text?: string},
  ): Promise<ActionModel> {
    await this.accessChecker.checkTeamAccess(auth, teamId);

    // The scoped accessor restricts the lookup to the caller's organisation; the team in the
    // path is the one whose membership was checked, so it has to own the action.
    const action = await this.actionRepository.findOneById(auth.db, actionId);

    if (!action || action.teamId !== teamId) {
      throw new NotFoundHttpError(`Action "${actionId}" not found`);
    }

    if (changes.assigneeId) {
      await this.checkAssignee(teamId, changes.assigneeId);
    }

    await this.actionRepository.update(actionId, {
      ...(changes.assigneeId === undefined ? {} : {assigneeId: changes.assigneeId}),
      ...(changes.status ? {status: changes.status} : {}),
      ...(changes.text ? {text: changes.text} : {}),
    });

    const updated = await this.actionRepository.findOneById(auth.db, actionId);

    if (!updated) {
      throw new ConflictHttpError(`Action "${actionId}" could not be updated`);
    }

    return RetroManager.toActionModel(updated);
  }

  private async checkAssignee(teamId: string, assigneeId?: string): Promise<void> {
    if (!assigneeId) {
      return;
    }

    const membership = await this.membershipRepository.findOne(teamId, assigneeId);

    if (!membership) {
      throw new ConflictHttpError('An action can only be assigned to a member of the team');
    }
  }
}
