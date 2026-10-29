import {v4 as uuid} from 'uuid';
import type {RetroPhase} from '~/Db/schema';
import {BadRequestHttpError, ConflictHttpError, NotFoundHttpError} from '~/Error/HttpError';
import type {ActionModel} from '~/Model/ActionModel';
import type {
  BoardModel,
  CardModel,
  ColumnModel,
  NoteModel,
  RetroSummaryModel,
  TeamRetroSummaryModel,
} from '~/Model/RetroModel';
import type {TimerAction, TimerModel} from '~/Model/TimerModel';
import type {
  ActionRow,
  BoardData,
  NoteRow,
  RetroRow,
} from '~/Repository/BoardRepository';
import type {BoardRepository} from '~/Repository/BoardRepository';
import type {ColumnRepository} from '~/Repository/ColumnRepository';
import type {MembershipRepository} from '~/Repository/MembershipRepository';
import type {RetroRepository, UpdateRetroInput} from '~/Repository/RetroRepository';
import type {VoteRepository} from '~/Repository/VoteRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {checkRetroAllowance} from '~/Security/Plans';
import {RetroAccessChecker} from '~/Security/RetroAccessChecker';
import type {RoleChecker} from '~/Security/RoleChecker';

const DEFAULT_COLUMNS = ['Start', 'Stop', 'Continue'];

/**
 * The board's structure is settled while people write and never after: once notes are placed,
 * renaming or removing a column moves the ground under them. The facilitator alone decides.
 */
const COLUMN_PHASES: RetroPhase[] = ['BRAINSTORM'];

/** The vote budget can move until the first vote is cast. */
const MAX_VOTES_PHASES: RetroPhase[] = ['BRAINSTORM', 'SHARE'];

const VOTING_PHASES: RetroPhase[] = ['VOTE', 'DISCUSS', 'ARCHIVED'];

/** Totals stay hidden while people are still voting, so nobody follows the crowd. */
const VOTES_REVEALED_PHASES: RetroPhase[] = ['DISCUSS', 'ARCHIVED'];

export class RetroManager {
  public constructor(
    private readonly retroRepository: RetroRepository,
    private readonly columnRepository: ColumnRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly boardRepository: BoardRepository,
    private readonly accessChecker: RetroAccessChecker,
    private readonly roleChecker: RoleChecker,
    private readonly voteRepository: VoteRepository,
  ) {}

  public async listByTeam(auth: AuthContext, teamId: string): Promise<RetroSummaryModel[]> {
    await this.accessChecker.checkTeamAccess(auth, teamId);
    const retros = await this.retroRepository.findAllByTeamId(auth.db, teamId);

    return retros.map((retro) => RetroManager.toSummary(retro, auth.userId));
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

  public async create(
    auth: AuthContext,
    teamId: string,
    title: string,
    columnTitles?: string[],
    maxVotes?: number,
  ): Promise<BoardModel> {
    // Membership first, then the role: an org admin passes the role check on every team, and
    // without this the retro would be written before the board read refused to return it.
    await this.accessChecker.checkTeamAccess(auth, teamId);
    await this.roleChecker.checkTeamAdmin(auth, teamId);
    await checkRetroAllowance(this.retroRepository, auth.orgId, auth.orgStatus);

    const id = uuid();
    // An explicit empty list is the blank template: the facilitator builds the columns.
    const titles = columnTitles ?? DEFAULT_COLUMNS;

    await this.retroRepository.create({
      createdBy: auth.userId,
      id,
      ...(maxVotes === undefined ? {} : {maxVotes}),
      orgId: auth.orgId,
      teamId,
      title,
    });

    await Promise.all(
      titles.map((columnTitle, position) =>
        this.columnRepository.create({id: uuid(), position, retroId: id, title: columnTitle}),
      ),
    );

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
    const {actions, clusters, columns, notes, retro, votes} = data;
    const myVotes = votes.filter((vote) => vote.userId === userId);

    return {
      actions: actions
        .filter((action) => action.retroId === retro.id)
        .map(RetroManager.toActionModel),
      // Anything still open from an earlier retro comes back on the board for review; an
      // action decided after this retro is not "earlier", even when it is open.
      carriedOverActions: actions
        .filter(
          (action) =>
            action.retroId !== retro.id &&
            action.status === 'OPEN' &&
            action.createdAt < retro.createdAt,
        )
        .map(RetroManager.toActionModel),
      columns: RetroManager.buildColumns(columns, notes, clusters, votes, retro.phase, userId),
      createdAt: retro.createdAt,
      createdBy: retro.createdBy,
      id: retro.id,
      isFacilitator: retro.facilitatorId === userId,
      maxVotes: retro.maxVotes,
      myNotesRevealed: notes.some((note) => note.authorId === userId && Boolean(note.revealed)),
      myVotesLeft: Math.max(0, retro.maxVotes - myVotes.reduce((total, {count}) => total + count, 0)),
      phase: retro.phase,
      teamId: retro.teamId,
      timer: RetroManager.toTimerModel(retro),
      title: retro.title,
      votesRevealed: VOTES_REVEALED_PHASES.includes(retro.phase),
    };
  }

  public async updateRetro(
    auth: AuthContext,
    retroId: string,
    changes: {
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
      (!changes.phase || changes.title || changes.timer || changes.maxVotes !== undefined)
    ) {
      throw new ConflictHttpError('Reopen the retro before changing it');
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

    // A board without columns has nowhere to put a note: it stays in the brainstorm until the
    // facilitator has built at least one.
    if (changes.phase && changes.phase !== 'BRAINSTORM') {
      const columns = await this.columnRepository.countByRetroId(retroId);

      if (!columns) {
        throw new ConflictHttpError('Add at least one column first');
      }
    }

    // Computed first: a refused timer action must not leave the votes already wiped.
    const timerChanges = changes.timer ? RetroManager.applyTimerAction(retro, changes.timer) : {};

    // Going back to grouping reshapes the cards, and a vote cast on a card that no longer
    // exists is lost anyway: the round starts over rather than leaving votes stranded.
    if (
      changes.phase &&
      VOTING_PHASES.includes(retro.phase) &&
      !VOTING_PHASES.includes(changes.phase)
    ) {
      await this.voteRepository.removeAllByRetroId(retroId);
    }

    await this.retroRepository.update(retroId, {
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

        // The round grows with the extension, otherwise the bar would run past its own end.
        const total = (retro.timerTotalMs ?? 0) + seconds * 1000;

        if (retro.timerRemainingMs !== null) {
          return {
            timerRemainingMs: retro.timerRemainingMs + seconds * 1000,
            timerTotalMs: total,
          };
        }

        if (!retro.timerEndsAt) {
          throw new ConflictHttpError('There is no timer to extend');
        }

        return {timerEndsAt: deadline(runningRemainingMs + seconds * 1000), timerTotalMs: total};
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

  public async addColumn(auth: AuthContext, retroId: string, title: string): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkFacilitatorAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, COLUMN_PHASES);

    const position = await this.columnRepository.nextPosition(retroId);

    await this.columnRepository.create({id: uuid(), position, retroId, title});

    return this.getBoard(auth, retroId);
  }

  public async renameColumn(
    auth: AuthContext,
    retroId: string,
    columnId: string,
    title: string,
  ): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkFacilitatorAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, COLUMN_PHASES);

    const column = await this.columnRepository.findOneById(retroId, columnId);

    if (!column) {
      throw new NotFoundHttpError(`Column "${columnId}" not found`);
    }

    await this.columnRepository.rename(retroId, columnId, title);

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
      author: {id: note.authorId, name: note.authorName},
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
