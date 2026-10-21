import type {Db} from '~/Db/connection';
import type {ActionStatus, RetroPhase} from '~/Db/schema';

export interface RetroRow {
  createdAt: string;
  createdBy: string;
  facilitatorId: string;
  id: string;
  maxVotes: number;
  orgId: string;
  phase: RetroPhase;
  teamId: string;
  timerEndsAt: string | null;
  timerRemainingMs: number | null;
  timerTotalMs: number | null;
  title: string;
}

export interface ColumnRow {
  id: string;
  position: number;
  title: string;
}

/** `authorName` is joined from `users`, never stored: a rename propagates. */
export interface NoteRow {
  authorId: string;
  authorName: string;
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
  createdAt: string;
  id: string;
  retroId: string | null;
  retroTitle: string | null;
  status: ActionStatus;
  text: string;
}

/**
 * Everything the board projection needs, in one place: four small indexed reads that SQLite
 * answers from the same page cache, rather than a query per card.
 */
export interface BoardData {
  actions: ActionRow[];
  clusters: ClusterRow[];
  columns: ColumnRow[];
  notes: NoteRow[];
  retro: RetroRow;
  votes: VoteRow[];
}

export class BoardRepository {
  public constructor(private readonly db: Db) {}

  /**
   * Caller must have validated access to `retro` first: child tables carry no org_id and
   * rely on the retro having been resolved through the scoped accessor (ADR D6).
   */
  public async loadBoard(retro: RetroRow): Promise<BoardData> {
    const [columns, notes, clusters, votes, actions] = await Promise.all([
      this.db
        .selectFrom('columns')
        .select(['id', 'title', 'position'])
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
    ]);

    return {actions, clusters, columns, notes, retro, votes};
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
