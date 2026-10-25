import type {Db} from '~/Db/connection';
import type {PresenceReader} from '~/Manager/AdminManager';
import type {BoardRepository, RetroRow} from '~/Repository/BoardRepository';
import {logger} from '~/logger';
import type {Authorizer, Connection} from '~/Realtime/RetroSession';
import {RetroSession} from '~/Realtime/RetroSession';

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

/**
 * The registry of live retro actors (ADR-001 D1).
 *
 * A session is created when the first participant subscribes and destroyed when the last one
 * leaves, which is scale-to-zero at the granularity that actually matters here: the session.
 */
export class SessionHub implements PresenceReader {
  private readonly sessions = new Map<string, RetroSession>();

  /**
   * Mutations on one board run one at a time, which is where ordering comes from. The queue
   * lives apart from the connections: an HTTP command must not create a session that nobody
   * releases, and the last participant leaving must not split a queue still holding work.
   */
  private readonly queues = new Map<string, {pending: number; tail: Promise<unknown>}>();

  /** Set once the managers exist: the hub is built before them. Fails closed until then. */
  private authorize: Authorizer = async () => false;

  public constructor(
    private readonly db: Db,
    private readonly boardRepository: BoardRepository,
  ) {}

  public setAuthorizer(authorize: Authorizer): void {
    this.authorize = authorize;
  }

  public get(retroId: string): RetroSession | undefined {
    return this.sessions.get(retroId);
  }

  public acquire(retroId: string): RetroSession {
    const existing = this.sessions.get(retroId);

    if (existing) {
      return existing;
    }

    const session = new RetroSession(
      retroId,
      this.boardRepository,
      () => this.loadRetro(retroId),
      (token, id) => this.authorize(token, id),
    );

    this.sessions.set(retroId, session);

    return session;
  }

  /** Serialises a command against this board, then fans the new board out from the queue. */
  public run<T>(retroId: string, work: () => Promise<T>): Promise<T> {
    const entry = this.queues.get(retroId) ?? {pending: 0, tail: Promise.resolve()};

    entry.pending += 1;
    this.queues.set(retroId, entry);

    const next = entry.tail.then(async () => {
      const result = await work();

      await this.notifyBoardChanged(retroId);

      return result;
    });

    const settle = (): void => {
      entry.pending -= 1;

      if (entry.pending === 0 && this.queues.get(retroId) === entry) {
        this.queues.delete(retroId);
      }
    };

    entry.tail = next.then(settle, settle);

    return next;
  }

  public release(retroId: string, connection: Connection): void {
    const session = this.sessions.get(retroId);

    if (!session) {
      return;
    }

    session.remove(connection);

    if (session.size === 0) {
      this.sessions.delete(retroId);
      return;
    }

    session.broadcastPresence();
  }

  /**
   * Called by the HTTP layer right after a business command has been handled. The broadcast
   * is triggered by the command, never by a database write, so adding an entity type can no
   * longer produce a silently missing broadcast.
   */
  public async notifyBoardChanged(retroId: string): Promise<void> {
    // The command has committed by now: a failed broadcast must not turn it into an error the
    // client would retry, duplicating the note or the vote.
    try {
      await this.sessions.get(retroId)?.broadcastBoard();
    } catch (error: unknown) {
      logger.error({err: error, retroId}, 'Board broadcast failed');
    }
  }

  /** Backs the facilitation takeover rule without any storage (BEHAVIOUR.md section 5). */
  public isWatching(retroId: string, userId: string): boolean {
    return this.sessions.get(retroId)?.isWatching(userId) ?? false;
  }

  public get liveRetroCount(): number {
    return this.sessions.size;
  }

  private async loadRetro(retroId: string): Promise<RetroRow | undefined> {
    return this.db
      .selectFrom('retros')
      .select(RETRO_COLUMNS)
      .where('id', '=', retroId)
      .executeTakeFirst();
  }
}
