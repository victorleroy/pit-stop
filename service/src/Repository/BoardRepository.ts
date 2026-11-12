import type {Db} from '~/Db/connection';
import type {ActionReviewOutcome, ActionStatus, RetroPhase} from '~/Db/schema';

export interface RetroRow {
  /** Always 0 or 1: whether the retro reviews the team's open actions before the brainstorm. */
  actionReview: number;
  createdAt: string;
  createdBy: string;
  defaultTimerSeconds: number | null;
  facilitatorId: string;
  /** Set on entering ICEBREAKER: from then on the question is asked, and counts as used. */
  icebreakerAskedAt: string | null;
  /** A bank question. */
  icebreakerQuestionId: string | null;
  id: string;
  maxVotes: number;
  orgId: string;
  phase: RetroPhase;
  /** The action the facilitator is reviewing, in REVIEW only. */
  reviewFocusActionId: string | null;
  teamId: string;
  /** Snapshot of the template the retro started from, never joined (ADR 0004). */
  templateId: string | null;
  templateName: string | null;
  timerEndsAt: string | null;
  timerRemainingMs: number | null;
  timerTotalMs: number | null;
  title: string;
}

export interface ColumnRow {
  id: string;
  position: number;
  prompt: string | null;
  title: string;
}

/** `authorName` is joined from `users`, never stored: a rename propagates. */
export interface NoteRow {
  authorId: string;
  authorName: string;
  authorPictureUrl: string | null;
  clusterId: string | null;
  columnId: string;
  createdAt: string;
  id: string;
  revealed: number;
  text: string;
}

export interface ClusterRow {
  columnId: string;
  id: string;
  title: string | null;
}

export interface VoteRow {
  count: number;
  targetId: string;
  userId: string;
}

/** `retroTitle` and `assigneeName` are joined, never stored (BEHAVIOUR.md section 2). */
export interface ActionRow {
  assigneeId: string | null;
  assigneeName: string | null;
  closedAt: string | null;
  createdAt: string;
  id: string;
  retroId: string | null;
  retroTitle: string | null;
  status: ActionStatus;
  text: string;
}

/** A review outcome recorded in this retro; the reviewer's name is joined, never stored. */
export interface ActionReviewRow {
  actionId: string;
  comment: string | null;
  outcome: ActionReviewOutcome;
  reviewedAt: string;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewerPictureUrl: string | null;
}

/** The author's name and picture are joined, never stored: a rename propagates. */
export interface IcebreakerAnswerRow {
  authorName: string;
  authorPictureUrl: string | null;
  createdAt: string;
  revealed: number;
  text: string;
  userId: string;
}

/**
 * Everything the board projection needs, in one place: four small indexed reads that SQLite
 * answers from the same page cache, rather than a query per card.
 */
export interface BoardData {
  /** The review outcomes recorded in this retro only. */
  actionReviews: ActionReviewRow[];
  actions: ActionRow[];
  clusters: ClusterRow[];
  columns: ColumnRow[];
  /** Oldest first. */
  icebreakerAnswers: IcebreakerAnswerRow[];
  notes: NoteRow[];
  retro: RetroRow;
  votes: VoteRow[];
}

export class BoardRepository {
  public constructor(private readonly db: Db) {}

  /**
   * Caller must have validated access to `retro` first: child tables carry no org_id and
   * rely on the retro having been resolved through the scoped accessor (ADR-001 D6).
   */
  public async loadBoard(retro: RetroRow): Promise<BoardData> {
    const [columns, notes, clusters, votes, actions, actionReviews, icebreakerAnswers] = await Promise.all([
      this.db
        .selectFrom('columns')
        .select(['id', 'title', 'position', 'prompt'])
        .where('retroId', '=', retro.id)
        .orderBy('position')
        .execute(),

      this.db
        .selectFrom('notes')
        .innerJoin('users', 'users.id', 'notes.authorId')
        .select([
          'notes.id',
          'notes.authorId',
          'users.name as authorName',
          'users.pictureUrl as authorPictureUrl',
          'notes.clusterId',
          'notes.columnId',
          'notes.createdAt',
          'notes.revealed',
          'notes.text',
        ])
        .where('notes.retroId', '=', retro.id)
        .orderBy('notes.createdAt')
        .execute(),

      this.db
        .selectFrom('clusters')
        .select(['id', 'columnId', 'title'])
        .where('retroId', '=', retro.id)
        .execute(),

      this.db
        .selectFrom('votes')
        .select(['userId', 'targetId', 'count'])
        .where('retroId', '=', retro.id)
        .execute(),

      this.findTeamActions(retro.teamId),

      this.db
        .selectFrom('actionReviews')
        .leftJoin('users', 'users.id', 'actionReviews.reviewedBy')
        .select([
          'actionReviews.actionId',
          'actionReviews.comment',
          'actionReviews.outcome',
          'actionReviews.reviewedAt',
          'actionReviews.reviewedBy',
          'users.name as reviewerName',
          'users.pictureUrl as reviewerPictureUrl',
        ])
        .where('actionReviews.retroId', '=', retro.id)
        .execute(),

      this.db
        .selectFrom('icebreakerAnswers')
        .innerJoin('users', 'users.id', 'icebreakerAnswers.userId')
        .select([
          'icebreakerAnswers.userId',
          'users.name as authorName',
          'users.pictureUrl as authorPictureUrl',
          'icebreakerAnswers.text',
          'icebreakerAnswers.revealed',
          'icebreakerAnswers.createdAt',
        ])
        .where('icebreakerAnswers.retroId', '=', retro.id)
        .orderBy('icebreakerAnswers.createdAt')
        .orderBy('icebreakerAnswers.userId')
        .execute(),
    ]);

    return {actionReviews, actions, clusters, columns, icebreakerAnswers, notes, retro, votes};
  }

  public async findTeamActions(teamId: string): Promise<ActionRow[]> {
    return this.db
      .selectFrom('actions')
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
        'actions.text',
      ])
      .where('actions.teamId', '=', teamId)
      .orderBy('actions.createdAt', 'desc')
      .execute();
  }

  /**
   * Deletes the retro and everything hanging under it: columns, notes, clusters and votes,
   * through the ON DELETE CASCADE of the schema. Actions are deliberately left alone, their
   * `retro_id` is nulled instead: they belong to the team and outlive the retro.
   */
  public async deleteBoard(retroId: string): Promise<void> {
    await this.db.deleteFrom('retros').where('id', '=', retroId).execute();
  }
}
