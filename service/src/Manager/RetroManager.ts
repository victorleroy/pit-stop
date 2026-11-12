import {v4 as uuid} from 'uuid';
import type {RetroPhase} from '~/Db/schema';
import {BadRequestHttpError, ConflictHttpError, NotFoundHttpError} from '~/Error/HttpError';
import {ICEBREAKER_QUESTIONS} from '~/Icebreaker/questions';
import type {IcebreakerManager} from '~/Manager/IcebreakerManager';
import type {ActionModel, ReviewItemModel} from '~/Model/ActionModel';
import type {
  BoardModel,
  CardModel,
  IcebreakerModel,
  IcebreakerQuestionModel,
  ColumnModel,
  NoteModel,
  RetroSummaryModel,
  TeamRetroSummaryModel,
} from '~/Model/RetroModel';
import type {TimerAction, TimerModel} from '~/Model/TimerModel';
import type {
  ActionReviewRow,
  ActionRow,
  BoardData,
  IcebreakerAnswerRow,
  NoteRow,
  RetroRow,
} from '~/Repository/BoardRepository';
import type {BoardRepository} from '~/Repository/BoardRepository';
import type {ColumnRepository} from '~/Repository/ColumnRepository';
import type {MembershipRepository} from '~/Repository/MembershipRepository';
import type {RetroRepository, UpdateRetroInput} from '~/Repository/RetroRepository';
import type {RetroTemplateManager} from '~/Manager/RetroTemplateManager';
import type {VoteRepository} from '~/Repository/VoteRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {checkRetroAllowance} from '~/Security/Plans';
import {RetroAccessChecker} from '~/Security/RetroAccessChecker';
import type {RoleChecker} from '~/Security/RoleChecker';
import {logger} from '~/logger';

/**
 * The board's structure is settled while people write and never after: once notes are placed,
 * renaming or removing a column moves the ground under them. The facilitator alone decides.
 */
const COLUMN_PHASES: RetroPhase[] = ['LOBBY', 'BRAINSTORM'];

/** The vote budget can move until the first vote is cast. */
const MAX_VOTES_PHASES: RetroPhase[] = ['LOBBY', 'BRAINSTORM', 'SHARE'];

/**
 * Arriving here wipes every vote, whatever the phase left: grouping reshapes the cards, and a
 * detour through an opening phase must not bring old votes back into the sharing.
 */
const VOTE_WIPING_TARGETS: readonly string[] = ['BRAINSTORM', 'SHARE'];

/** The phases a board without columns may enter: nothing in them needs a column yet. */
const COLUMNLESS_TARGETS: readonly string[] = ['ICEBREAKER', 'REVIEW', 'BRAINSTORM'];

const MIN_TIMER_SECONDS = 5;

const VOTING_PHASES: RetroPhase[] = ['VOTE', 'DISCUSS', 'ARCHIVED'];

/** Totals stay hidden while people are still voting, so nobody follows the crowd. */
const VOTES_REVEALED_PHASES: RetroPhase[] = ['DISCUSS', 'ARCHIVED'];

export const DICE_PHASE: RetroPhase = 'DISCUSS';

const QUESTIONS_BY_ID = new Map(ICEBREAKER_QUESTIONS.map((question) => [question.id, question]));

export class RetroManager {
  public constructor(
    private readonly retroRepository: RetroRepository,
    private readonly columnRepository: ColumnRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly boardRepository: BoardRepository,
    private readonly accessChecker: RetroAccessChecker,
    private readonly roleChecker: RoleChecker,
    private readonly voteRepository: VoteRepository,
    private readonly templateManager: RetroTemplateManager,
    private readonly icebreakerManager: IcebreakerManager,
  ) {}

  public async listByTeam(auth: AuthContext, teamId: string): Promise<RetroSummaryModel[]> {
    await this.accessChecker.checkTeamAccess(auth, teamId);
    const retros = await this.retroRepository.findAllByTeamId(auth.db, teamId);

    return retros.map((retro) => RetroManager.toSummary(retro, auth.userId));
  }

  /**
   * The team's retros among the given ones, typically the live ones: a write that changes the
   * boards of a whole team refreshes these. The caller has checked access to the team.
   */
  public async findTeamRetroIds(
    auth: AuthContext,
    teamId: string,
    retroIds: string[],
  ): Promise<string[]> {
    return this.retroRepository.findIdsByTeamId(auth.db, teamId, retroIds);
  }

  /** The other retros of this retro's team among the given ones. */
  public async findSiblingRetroIds(
    auth: AuthContext,
    retroId: string,
    retroIds: string[],
  ): Promise<string[]> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    const ids = await this.findTeamRetroIds(auth, retro.teamId, retroIds);

    return ids.filter((id) => id !== retroId);
  }

  /** Every retro of every team the caller belongs to, most recent first. */
  public async listMine(auth: AuthContext): Promise<TeamRetroSummaryModel[]> {
    const memberships = await this.membershipRepository.findAllByUserId(auth.userId, auth.orgId);
    const namesByTeam = new Map(memberships.map((m) => [m.teamId, m.teamName]));

    const retros = await this.retroRepository.findAllByTeamIds(
      auth.db,
      memberships.map(({teamId}) => teamId),
    );

    return retros
      .map((retro) => ({
        ...RetroManager.toSummary(retro, auth.userId),
        teamId: retro.teamId,
        teamName: namesByTeam.get(retro.teamId) ?? '',
      }))
      .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));
  }

  /**
   * A retro starts from a template, or from an explicit list of columns, never both; with
   * neither, from the team default. The template is copied here and never read again
   * (ADR 0004): editing it later does not touch this retro. An icebreaker is drawn now and
   * asked on entering ICEBREAKER; without one asked for, the retro has none.
   */
  public async create(
    auth: AuthContext,
    teamId: string,
    title: string,
    options: {
      actionReview?: boolean;
      columns?: string[];
      icebreaker?: boolean;
      maxVotes?: number;
      templateId?: string;
    } = {},
  ): Promise<BoardModel> {
    // Membership first, then the role: an org admin passes the role check on every team, and
    // without this the retro would be written before the board read refused to return it.
    await this.accessChecker.checkTeamAccess(auth, teamId);
    await this.roleChecker.checkTeamAdmin(auth, teamId);
    await checkRetroAllowance(this.retroRepository, auth.orgId, auth.orgStatus);

    if (options.columns && options.templateId !== undefined) {
      throw new BadRequestHttpError('Send a template or columns, not both');
    }

    // An explicit empty list is the blank board: the facilitator builds the columns.
    const template = options.columns
      ? undefined
      : await this.templateManager.resolve(auth, teamId, options.templateId);
    const columns = template
      ? template.columns
      : (options.columns ?? []).map((columnTitle) => ({prompt: null, title: columnTitle}));
    const maxVotes = options.maxVotes ?? template?.maxVotes ?? undefined;

    const id = uuid();
    const icebreakerQuestionId = (options.icebreaker ?? template?.icebreaker ?? false)
      ? await this.icebreakerManager.drawFor(auth, {id, teamId})
      : null;

    // One transaction: a failure leaves neither a retro without its columns nor orphan columns.
    await auth.db.unscoped.transaction().execute(async (trx) => {
      await this.retroRepository.create(
        {
          actionReview: (options.actionReview ?? template?.actionReview ?? true) ? 1 : 0,
          createdBy: auth.userId,
          defaultTimerSeconds: template?.timerSeconds ?? null,
          icebreakerQuestionId,
          id,
          ...(maxVotes === undefined ? {} : {maxVotes}),
          orgId: auth.orgId,
          teamId,
          templateId: template?.id ?? null,
          templateName: template?.name ?? null,
          title,
        },
        trx,
      );

      for (const [position, column] of columns.entries()) {
        await this.columnRepository.create(
          {id: uuid(), position, prompt: column.prompt, retroId: id, title: column.title},
          trx,
        );
      }
    });

    return this.getBoard(auth, id);
  }

  public async getBoard(auth: AuthContext, retroId: string): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    const data = await this.boardRepository.loadBoard(retro);

    return RetroManager.projectBoard(data, auth.userId);
  }

  /**
   * Pure projection of a board for one recipient. Shared by the HTTP read and the websocket
   * broadcast so the anonymity rules only ever live in one place.
   */
  public static projectBoard(data: BoardData, userId: string): BoardModel {
    const {actionReviews, actions, clusters, columns, icebreakerAnswers, notes, retro, votes} = data;
    const myVotes = votes.filter((vote) => vote.userId === userId);

    return {
      actions: actions
        .filter((action) => action.retroId === retro.id)
        .map(RetroManager.toActionModel),
      // Anything still open from an earlier retro comes back on the board for review; an
      // action decided after this retro is not "earlier", even when it is open.
      carriedOverActions: actions
        .filter((action) => RetroManager.isCarriedOver(retro, action))
        .map(RetroManager.toActionModel),
      columns: RetroManager.buildColumns(columns, notes, clusters, votes, retro.phase, userId),
      createdAt: retro.createdAt,
      createdBy: retro.createdBy,
      defaultTimerSeconds: retro.defaultTimerSeconds,
      id: retro.id,
      facilitatorId: retro.facilitatorId,
      icebreaker: RetroManager.buildIcebreaker(retro, icebreakerAnswers, userId),
      isFacilitator: retro.facilitatorId === userId,
      maxVotes: retro.maxVotes,
      myNotesRevealed: notes.some((note) => note.authorId === userId && Boolean(note.revealed)),
      myVotesLeft: Math.max(0, retro.maxVotes - myVotes.reduce((total, {count}) => total + count, 0)),
      phase: retro.phase,
      review: {
        enabled: Boolean(retro.actionReview),
        focusActionId: retro.reviewFocusActionId,
        items: RetroManager.buildReviewItems(retro, actions, actionReviews),
      },
      teamId: retro.teamId,
      template:
        retro.templateId && retro.templateName
          ? {id: retro.templateId, name: retro.templateName}
          : null,
      timer: RetroManager.toTimerModel(retro),
      title: retro.title,
      voteProgress: retro.phase === 'VOTE' ? RetroManager.countVotesByUser(votes) : {},
      votesRevealed: VOTES_REVEALED_PHASES.includes(retro.phase),
    };
  }

  /**
   * Answers are post-its, signed like notes: everyone sees who answered, and the text reaches
   * the others only once its author shares it. The question stays a surprise until it is
   * asked, for everyone; a question never asked disappears once the retro moves on.
   */
  public static buildIcebreaker(
    retro: RetroRow,
    answers: IcebreakerAnswerRow[],
    userId: string,
  ): IcebreakerModel | null {
    const isAsked = retro.icebreakerAskedAt !== null;

    if (retro.icebreakerQuestionId === null || (!isAsked && retro.phase !== 'LOBBY')) {
      return null;
    }

    return {
      answeredCount: answers.length,
      answers: answers.map((answer) => {
        const mine = answer.userId === userId;
        const revealed = Boolean(answer.revealed);

        return {
          author: {
            id: answer.userId,
            name: answer.authorName,
            ...(answer.authorPictureUrl ? {pictureUrl: answer.authorPictureUrl} : {}),
          },
          mine,
          revealed,
          text: revealed || mine ? answer.text : '',
        };
      }),
      question: isAsked ? RetroManager.toQuestion(retro) : null,
      state: isAsked ? 'ASKED' : 'WAITING',
    };
  }

  private static toQuestion(retro: RetroRow): IcebreakerQuestionModel {
    const question = QUESTIONS_BY_ID.get(retro.icebreakerQuestionId ?? '');

    if (!question) {
      logger.error({questionId: retro.icebreakerQuestionId, retroId: retro.id}, 'Unknown icebreaker question');

      return {id: retro.icebreakerQuestionId ?? '', text: ''};
    }

    return {id: question.id, text: question.text};
  }

  /**
   * What this retro reviews: the actions it carries over, plus those it already reviewed
   * whatever their status now, or an action marked done would vanish on the next broadcast.
   * Oldest first, then by id, so everyone sees the same order. Identical for every reader.
   */
  public static buildReviewItems(
    retro: RetroRow,
    actions: ActionRow[],
    reviews: ActionReviewRow[],
  ): ReviewItemModel[] {
    const byAction = new Map(reviews.map((review) => [review.actionId, review]));

    return actions
      .filter((action) => byAction.has(action.id) || RetroManager.isCarriedOver(retro, action))
      .sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .map((action) => {
        const review = byAction.get(action.id);

        return {
          action: RetroManager.toActionModel(action),
          ...(review
            ? {
                ...(review.comment ? {comment: review.comment} : {}),
                outcome: review.outcome,
                reviewedAt: review.reviewedAt,
                ...(review.reviewedBy && review.reviewerName
                  ? {
                      reviewedBy: {
                        id: review.reviewedBy,
                        name: review.reviewerName,
                        ...(review.reviewerPictureUrl ? {pictureUrl: review.reviewerPictureUrl} : {}),
                      },
                    }
                  : {}),
              }
            : {}),
        };
      });
  }

  /** Still open, from another retro, and decided before this one: the existing carry-over rule. */
  public static isCarriedOver(retro: RetroRow, action: ActionRow): boolean {
    return action.retroId !== retro.id && action.status === 'OPEN' && action.createdAt < retro.createdAt;
  }

  /** How many votes each person spent, never on what: the room can see who is done voting. */
  private static countVotesByUser(votes: BoardData['votes']): Record<string, number> {
    const used: Record<string, number> = {};

    for (const {count, userId} of votes) {
      used[userId] = (used[userId] ?? 0) + count;
    }

    return used;
  }

  /** The speaking-order dice exist during the discussion only; resetting them is the facilitator's. */
  public async checkDice(auth: AuthContext, retroId: string, asFacilitator: boolean): Promise<void> {
    const {retro} = asFacilitator
      ? await this.accessChecker.checkFacilitatorAccess(auth, retroId)
      : await this.accessChecker.checkRetroAccess(auth, retroId);

    RetroAccessChecker.checkPhaseAllows(retro.phase, [DICE_PHASE]);
  }

  public async updateRetro(
    auth: AuthContext,
    retroId: string,
    changes: {
      actionReview?: boolean;
      maxVotes?: number;
      phase?: RetroPhase;
      timer?: {action: TimerAction; seconds?: number};
      title?: string;
    },
  ): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkFacilitatorAccess(auth, retroId);

    // An archived retro is frozen, but never a dead end: reopening it is always possible.
    if (
      retro.phase === 'ARCHIVED' &&
      (!changes.phase ||
        changes.title ||
        changes.timer ||
        changes.maxVotes !== undefined ||
        changes.actionReview !== undefined)
    ) {
      throw new ConflictHttpError('Reopen the retro before changing it');
    }

    // LOBBY means "not started yet", which stops being true the moment it is left.
    if (changes.phase === 'LOBBY' && retro.phase !== 'LOBBY') {
      throw new ConflictHttpError('The retro has already started');
    }

    // Whether the retro opens with a review is part of its preparation, settled before it starts.
    if (changes.actionReview !== undefined && retro.phase !== 'LOBBY') {
      throw new ConflictHttpError('The action review can only change before the retro starts');
    }

    if (changes.phase === 'LOBBY') {
      const {phase: _unchanged, ...rest} = changes;

      changes = rest;
    }

    // The budget is set before anyone spends it: changing it mid-vote would rewrite the rules
    // for the people who already voted. Judged on the phase the retro lands in, so going back
    // to the brainstorm (which wipes the votes) can set it, and entering the vote cannot.
    if (
      changes.maxVotes !== undefined &&
      !MAX_VOTES_PHASES.includes(changes.phase ?? retro.phase)
    ) {
      throw new ConflictHttpError('Votes per person can only change before voting starts');
    }

    // A board without columns has nowhere to put a note: it stays in the brainstorm (or before)
    // until the facilitator has built at least one.
    if (changes.phase && !COLUMNLESS_TARGETS.includes(changes.phase)) {
      const columns = await this.columnRepository.countByRetroId(retroId);

      if (!columns) {
        throw new ConflictHttpError('Add at least one column first');
      }
    }

    // Computed first: a refused timer action must not leave the votes already wiped.
    const timerChanges = changes.timer ? RetroManager.applyTimerAction(retro, changes.timer) : {};

    // Going back to grouping reshapes the cards, and a vote cast on a card that no longer
    // exists is lost anyway: the round starts over rather than leaving votes stranded.
    if (changes.phase && VOTE_WIPING_TARGETS.includes(changes.phase)) {
      await this.voteRepository.removeAllByRetroId(retroId);
    }

    // Entering the icebreaker asks its question, drawn on the spot if there is none yet. It is
    // asked once: coming back later keeps the question, its date and its answers.
    const icebreakerChanges: UpdateRetroInput = {};

    if (changes.phase === 'ICEBREAKER' && retro.phase !== 'ICEBREAKER') {
      if (retro.icebreakerQuestionId === null) {
        icebreakerChanges.icebreakerQuestionId = await this.icebreakerManager.drawFor(auth, retro);
      }

      if (retro.icebreakerAskedAt === null) {
        icebreakerChanges.icebreakerAskedAt = new Date().toISOString();
      }
    }

    // Entering the review puts the first action nobody has decided on in focus; leaving it
    // drops the focus, so coming back starts from what is still undecided.
    const reviewChanges: UpdateRetroInput = {};

    if (changes.phase === 'REVIEW' && retro.phase !== 'REVIEW') {
      const data = await this.boardRepository.loadBoard(retro);
      const items = RetroManager.buildReviewItems(retro, data.actions, data.actionReviews);

      reviewChanges.reviewFocusActionId = items.find((item) => !item.outcome)?.action.id ?? null;
    } else if (changes.phase && changes.phase !== 'REVIEW' && retro.phase === 'REVIEW') {
      reviewChanges.reviewFocusActionId = null;
    }

    await this.retroRepository.update(retroId, {
      ...icebreakerChanges,
      ...reviewChanges,
      ...(changes.actionReview === undefined ? {} : {actionReview: changes.actionReview ? 1 : 0}),
      ...(changes.maxVotes === undefined ? {} : {maxVotes: changes.maxVotes}),
      ...(changes.phase ? {phase: changes.phase} : {}),
      ...(changes.title ? {title: changes.title} : {}),
      ...timerChanges,
    });

    return this.getBoard(auth, retroId);
  }

  /**
   * The clock lives as an absolute deadline while running, and as a remaining duration once
   * paused. Clients only ever count down locally, so a slow network never eats the timer.
   */
  private static applyTimerAction(
    retro: RetroRow,
    {action, seconds}: {action: TimerAction; seconds?: number},
  ): UpdateRetroInput {
    const now = Date.now();
    const runningRemainingMs = retro.timerEndsAt
      ? Math.max(0, new Date(retro.timerEndsAt).getTime() - now)
      : 0;
    const deadline = (ms: number) => new Date(now + ms).toISOString();

    switch (action) {
      case 'start': {
        if (!seconds) {
          throw new BadRequestHttpError('Starting the timer needs a duration');
        }

        if (seconds < MIN_TIMER_SECONDS) {
          throw new BadRequestHttpError('The timer lasts at least 5 seconds');
        }

        return {
          timerEndsAt: deadline(seconds * 1000),
          timerRemainingMs: null,
          timerTotalMs: seconds * 1000,
        };
      }

      case 'pause': {
        if (retro.timerRemainingMs !== null || !retro.timerEndsAt) {
          throw new ConflictHttpError('The timer is not running');
        }

        return {timerEndsAt: null, timerRemainingMs: runningRemainingMs};
      }

      case 'resume': {
        if (retro.timerRemainingMs === null) {
          throw new ConflictHttpError('The timer is not paused');
        }

        return {timerEndsAt: deadline(retro.timerRemainingMs), timerRemainingMs: null};
      }

      case 'extend': {
        if (!seconds) {
          throw new BadRequestHttpError('Extending the timer needs a duration');
        }

        const isPaused = retro.timerRemainingMs !== null;

        if (!isPaused && !retro.timerEndsAt) {
          throw new ConflictHttpError('There is no timer to extend');
        }

        const currentMs = isPaused ? retro.timerRemainingMs! : runningRemainingMs;

        if (seconds < 0 && currentMs === 0) {
          throw new ConflictHttpError('The timer is already over');
        }

        // A negative extension that exceeds what is left ends the round instead of going below zero.
        const remainingMs = Math.max(0, currentMs + seconds * 1000);
        // The round follows the extension, otherwise the bar would run past its own end.
        const total = Math.max(remainingMs, (retro.timerTotalMs ?? 0) + seconds * 1000);

        return isPaused
          ? {timerRemainingMs: remainingMs, timerTotalMs: total}
          : {timerEndsAt: deadline(remainingMs), timerTotalMs: total};
      }

      case 'stop':
      default:
        return {timerEndsAt: null, timerRemainingMs: null, timerTotalMs: null};
    }
  }

  public async remove(auth: AuthContext, retroId: string): Promise<void> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);

    await this.roleChecker.checkTeamAdmin(auth, retro.teamId);
    await this.boardRepository.deleteBoard(retroId);
  }

  public async addColumn(
    auth: AuthContext,
    retroId: string,
    title: string,
    prompt: string | null = null,
  ): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkFacilitatorAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, COLUMN_PHASES);

    const position = await this.columnRepository.nextPosition(retroId);

    await this.columnRepository.create({id: uuid(), position, prompt, retroId, title});

    return this.getBoard(auth, retroId);
  }

  /** The prompt follows the title: settled while people write, by the facilitator alone. */
  public async updateColumn(
    auth: AuthContext,
    retroId: string,
    columnId: string,
    changes: {prompt?: string | null; title?: string},
  ): Promise<BoardModel> {
    if (changes.title === undefined && changes.prompt === undefined) {
      throw new BadRequestHttpError('Send a title or a prompt');
    }

    const {retro} = await this.accessChecker.checkFacilitatorAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, COLUMN_PHASES);

    const column = await this.columnRepository.findOneById(retroId, columnId);

    if (!column) {
      throw new NotFoundHttpError(`Column "${columnId}" not found`);
    }

    await this.columnRepository.update(retroId, columnId, {
      ...(changes.title === undefined ? {} : {title: changes.title}),
      ...(changes.prompt === undefined ? {} : {prompt: changes.prompt}),
    });

    return this.getBoard(auth, retroId);
  }

  /** The full new order, not a single move: two facilitators' tabs cannot interleave half-moves. */
  public async reorderColumns(
    auth: AuthContext,
    retroId: string,
    columnIds: string[],
  ): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkFacilitatorAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, COLUMN_PHASES);

    const current = new Set(await this.columnRepository.findIdsByRetroId(retroId));

    if (
      columnIds.length !== current.size ||
      new Set(columnIds).size !== current.size ||
      columnIds.some((id) => !current.has(id))
    ) {
      throw new ConflictHttpError('The order must list every column of the board once');
    }

    await this.columnRepository.reorder(retroId, columnIds);

    return this.getBoard(auth, retroId);
  }

  public async removeColumn(
    auth: AuthContext,
    retroId: string,
    columnId: string,
  ): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkFacilitatorAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, COLUMN_PHASES);

    const data = await this.boardRepository.loadBoard(retro);
    const column = data.columns.find(({id}) => id === columnId);

    if (!column) {
      throw new NotFoundHttpError(`Column "${columnId}" not found`);
    }

    if (data.notes.some((note) => note.columnId === columnId)) {
      throw new ConflictHttpError('Move or delete its notes before removing the column');
    }

    await this.columnRepository.remove(retroId, columnId);

    return this.getBoard(auth, retroId);
  }

  private static buildColumns(
    columns: BoardData['columns'],
    notes: NoteRow[],
    clusters: BoardData['clusters'],
    votes: BoardData['votes'],
    phase: RetroPhase,
    userId: string,
  ): ColumnModel[] {
    const showVotes = VOTING_PHASES.includes(phase);
    const revealTotals = VOTES_REVEALED_PHASES.includes(phase);

    const countVotes = (targetId: string) =>
      votes
        .filter((vote) => vote.targetId === targetId)
        .reduce(
          (accumulator, vote) => ({
            mine: accumulator.mine + (vote.userId === userId ? vote.count : 0),
            total: accumulator.total + vote.count,
          }),
          {mine: 0, total: 0},
        );

    const toCard = (
      id: string,
      type: CardModel['type'],
      cardNotes: NoteModel[],
      title?: string,
    ): CardModel => {
      const {mine, total} = countVotes(id);

      return {
        id,
        myVotes: showVotes ? mine : 0,
        notes: cardNotes,
        ...(title === undefined ? {} : {title}),
        ...(revealTotals ? {totalVotes: total} : {}),
        type,
      };
    };

    const byCreation = (left: NoteModel, right: NoteModel) =>
      (left.createdAt ?? '').localeCompare(right.createdAt ?? '');

    return columns
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((column) => {
        const visible = notes.filter((note) => note.columnId === column.id);

        const columnClusters = clusters.filter((cluster) => cluster.columnId === column.id);
        const clusterIds = new Set(columnClusters.map(({id}) => id));

        const clusterCards = columnClusters.map((cluster) =>
          toCard(
            cluster.id,
            'cluster',
            visible
              .filter((note) => note.clusterId === cluster.id)
              .map((note) => RetroManager.toNoteModel(note, userId))
              .sort(byCreation),
            cluster.title ?? undefined,
          ),
        );

        // A note whose cluster no longer exists falls back to a standalone card.
        const loneCards = visible
          .filter((note) => !note.clusterId || !clusterIds.has(note.clusterId))
          .map((note) => RetroManager.toNoteModel(note, userId))
          .sort(byCreation)
          .map((note) => toCard(note.id, 'note', [note]));

        const cards = [...loneCards, ...clusterCards].filter(
          (card) => card.type === 'note' || card.notes.length > 0,
        );

        return {
          cards: revealTotals
            ? cards.sort((left, right) => (right.totalVotes ?? 0) - (left.totalVotes ?? 0))
            : cards,
          id: column.id,
          order: column.position,
          prompt: column.prompt,
          title: column.title,
        };
      });
  }

  /**
   * What a retro protects is the content, not the presence: everyone sees that Victor wrote
   * three notes, nobody reads them until he shares them. The text is dropped here, so a
   * withheld note leaves the service empty rather than trusting the client to hide it.
   */
  private static toNoteModel(note: NoteRow, userId: string): NoteModel {
    const isMine = note.authorId === userId;
    const revealed = Boolean(note.revealed);

    return {
      author: {
        id: note.authorId,
        name: note.authorName,
        ...(note.authorPictureUrl ? {pictureUrl: note.authorPictureUrl} : {}),
      },
      columnId: note.columnId,
      createdAt: note.createdAt,
      id: note.id,
      isMine,
      revealed,
      text: revealed || isMine ? note.text : '',
    };
  }

  private static toTimerModel(retro: RetroRow): TimerModel {
    const total = retro.timerTotalMs === null ? {} : {totalMs: retro.timerTotalMs};

    if (retro.timerRemainingMs !== null) {
      return {...total, remainingMs: retro.timerRemainingMs, state: 'PAUSED'};
    }

    if (retro.timerEndsAt) {
      // remainingMs travels with the deadline so a client whose clock is off still counts the
      // right duration: it anchors on its own clock at reception rather than on endsAt.
      const remainingMs = Math.max(0, new Date(retro.timerEndsAt).getTime() - Date.now());

      return {...total, endsAt: retro.timerEndsAt, remainingMs, state: 'RUNNING'};
    }

    return {state: 'IDLE'};
  }

  public static toActionModel(action: ActionRow): ActionModel {
    return {
      ...(action.assigneeId && action.assigneeName
        ? {assignee: {id: action.assigneeId, name: action.assigneeName}}
        : {}),
      closedAt: action.closedAt,
      createdAt: action.createdAt,
      id: action.id,
      ...(action.retroId ? {retroId: action.retroId} : {}),
      ...(action.retroTitle ? {retroTitle: action.retroTitle} : {}),
      status: action.status,
      text: action.text,
    };
  }

  private static toSummary(retro: RetroRow, userId: string): RetroSummaryModel {
    return {
      createdAt: retro.createdAt,
      createdBy: retro.createdBy,
      id: retro.id,
      isFacilitator: retro.facilitatorId === userId,
      phase: retro.phase,
      title: retro.title,
    };
  }
}
