import {v4 as uuid} from 'uuid';
import type {ActionReviewOutcome, RetroPhase} from '~/Db/schema';
import {ConflictHttpError, NotFoundHttpError} from '~/Error/HttpError';
import {RetroManager} from '~/Manager/RetroManager';
import type {ActionStatsModel, ReviewItemModel, TrendPointModel} from '~/Model/ActionModel';
import type {ActionRepository} from '~/Repository/ActionRepository';
import type {ActionReviewRepository, ReviewCounts} from '~/Repository/ActionReviewRepository';
import type {BoardRepository, RetroRow} from '~/Repository/BoardRepository';
import type {RetroRepository} from '~/Repository/RetroRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {RetroAccessChecker} from '~/Security/RetroAccessChecker';

/**
 * Outcomes are tied to the retro that recorded them, and an archived retro is frozen: unlike
 * an action edit, recording one is refused in ARCHIVED (BEHAVIOUR.md section 3).
 */
const REVIEW_OUTCOME_PHASES: RetroPhase[] = ['REVIEW', 'BRAINSTORM', 'SHARE', 'VOTE', 'DISCUSS'];

/** The shared focus exists while the team walks through its actions, nowhere else. */
const REVIEW_PHASES: RetroPhase[] = ['REVIEW'];

const TREND_POINTS = 6;

/** Done, Drop or Keep on the actions a retro reviews, and the team metrics built on them. */
export class ReviewManager {
  public constructor(
    private readonly actionRepository: ActionRepository,
    private readonly actionReviewRepository: ActionReviewRepository,
    private readonly boardRepository: BoardRepository,
    private readonly retroRepository: RetroRepository,
    private readonly accessChecker: RetroAccessChecker,
  ) {}

  public async recordOutcome(
    auth: AuthContext,
    retroId: string,
    actionId: string,
    outcome: ActionReviewOutcome,
    rawComment?: string | null,
  ): Promise<ReviewItemModel> {
    const {action, existing, retro} = await this.findReviewable(auth, retroId, actionId);
    const comment =
      rawComment === undefined ? (existing?.comment ?? null) : rawComment?.trim() || null;

    await auth.db.unscoped.transaction().execute(async (trx) => {
      // The same outcome again only corrects the comment: the closing date, and with it the
      // metrics, stay where the first decision put them.
      if (existing?.outcome === outcome) {
        await this.actionReviewRepository.updateComment(actionId, retroId, comment, trx);
        return;
      }

      // One timestamp for both rows: undoing later recognises its own closing by it.
      const now = new Date().toISOString();

      if (outcome === 'KEPT') {
        await this.actionRepository.update(actionId, {closedAt: null, status: 'OPEN'}, trx);
      } else if (action.status !== outcome) {
        await this.actionRepository.update(actionId, {closedAt: now, status: outcome}, trx);
      }

      await this.actionReviewRepository.upsert(
        {
          actionId,
          comment,
          id: uuid(),
          orgId: auth.orgId,
          outcome,
          retroId,
          reviewedAt: now,
          reviewedBy: auth.userId,
          teamId: retro.teamId,
        },
        trx,
      );
    });

    return this.findItem(retro, actionId);
  }

  /**
   * Removes the outcome. The action is reopened only if it still carries the closing that
   * outcome made; a closing or reopening done elsewhere since is left alone.
   */
  public async clearOutcome(auth: AuthContext, retroId: string, actionId: string): Promise<void> {
    const {action, existing} = await this.findReviewable(auth, retroId, actionId);

    if (!existing) {
      return;
    }

    await auth.db.unscoped.transaction().execute(async (trx) => {
      if (
        existing.outcome !== 'KEPT' &&
        action.status === existing.outcome &&
        action.closedAt === existing.reviewedAt
      ) {
        await this.actionRepository.update(actionId, {closedAt: null, status: 'OPEN'}, trx);
      }

      await this.actionReviewRepository.remove(actionId, retroId, trx);
    });
  }

  /**
   * Points everyone at the same action, the facilitator's to move. The focus is board state:
   * it reaches late joiners and survives a restart like the rest of the board.
   */
  public async setFocus(auth: AuthContext, retroId: string, actionId: string | null): Promise<void> {
    const {retro} = await this.accessChecker.checkFacilitatorAccess(auth, retroId);

    RetroAccessChecker.checkPhaseAllows(retro.phase, REVIEW_PHASES);

    if (actionId !== null) {
      const action = await this.actionRepository.findOneById(auth.db, actionId);
      const isReviewed =
        action?.teamId === retro.teamId &&
        (RetroManager.isCarriedOver(retro, action) ||
          (await this.actionReviewRepository.findOne(auth.db, actionId, retroId)) !== undefined);

      if (!isReviewed) {
        throw new ConflictHttpError('This action is not part of this review');
      }
    }

    await this.retroRepository.update(retroId, {reviewFocusActionId: actionId});
  }

  /**
   * Follow-through of a team, seen from `retroId` or, without it, from the latest retro (then
   * "since the last retro" counts from that latest retro itself).
   */
  public async getStats(
    auth: AuthContext,
    teamId: string,
    retroId?: string,
  ): Promise<ActionStatsModel> {
    await this.accessChecker.checkTeamAccess(auth, teamId);

    const retros = await this.retroRepository.findAllByTeamId(auth.db, teamId);
    let current: RetroRow | undefined;
    let previous: RetroRow | undefined;

    if (retroId) {
      current = retros.find(({id}) => id === retroId);

      if (!current) {
        throw new NotFoundHttpError(`Retro "${retroId}" not found`);
      }

      const createdAt = current.createdAt;

      previous = retros.find((retro) => retro.createdAt < createdAt);
    } else {
      previous = retros[0];
    }

    const [openCount, doneSinceLastRetro, droppedSinceLastRetro, trend] = await Promise.all([
      this.actionRepository.countOpen(auth.db, teamId),
      this.actionRepository.countClosedSince(auth.db, teamId, 'DONE', previous?.createdAt),
      this.actionRepository.countClosedSince(auth.db, teamId, 'DROPPED', previous?.createdAt),
      this.actionReviewRepository.trendByTeam(auth.db, teamId, TREND_POINTS),
    ]);

    if (current && !trend.some((point) => point.retroId === current.id)) {
      const counts = await this.actionReviewRepository.countsByRetro(auth.db, current.id);

      trend.splice(TREND_POINTS - 1);
      trend.push(
        counts ?? {
          createdAt: current.createdAt,
          done: 0,
          dropped: 0,
          kept: 0,
          retroId: current.id,
          retroTitle: current.title,
        },
      );
    }

    return {
      completionTrend: trend
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map((point) => ReviewManager.toTrendPoint(point, current?.id)),
      doneSinceLastRetro,
      droppedSinceLastRetro,
      openCount,
    };
  }

  /** Access, phase, team and membership of the review, in the order the error codes need. */
  private async findReviewable(auth: AuthContext, retroId: string, actionId: string) {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);

    RetroAccessChecker.checkPhaseAllows(retro.phase, REVIEW_OUTCOME_PHASES);

    const action = await this.actionRepository.findOneById(auth.db, actionId);

    if (!action || action.teamId !== retro.teamId) {
      throw new NotFoundHttpError(`Action "${actionId}" not found`);
    }

    const existing = await this.actionReviewRepository.findOne(auth.db, actionId, retroId);

    if (!existing && !RetroManager.isCarriedOver(retro, action)) {
      throw new ConflictHttpError('This action is not part of this review');
    }

    return {action, existing, retro};
  }

  private async findItem(retro: RetroRow, actionId: string): Promise<ReviewItemModel> {
    const data = await this.boardRepository.loadBoard(retro);
    const item = RetroManager.buildReviewItems(retro, data.actions, data.actionReviews).find(
      ({action}) => action.id === actionId,
    );

    if (!item) {
      throw new ConflictHttpError(`Action "${actionId}" could not be reviewed`);
    }

    return item;
  }

  private static toTrendPoint(counts: ReviewCounts, currentId?: string): TrendPointModel {
    const done = Number(counts.done);
    const dropped = Number(counts.dropped);
    const kept = Number(counts.kept);
    const total = done + dropped + kept;

    return {
      createdAt: counts.createdAt,
      current: counts.retroId === currentId,
      done,
      dropped,
      kept,
      rate: total === 0 ? null : Math.round((done / total) * 100) / 100,
      retroId: counts.retroId,
      retroTitle: counts.retroTitle,
    };
  }
}
