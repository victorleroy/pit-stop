import type {Db} from '~/Db/connection';
import type {PresenceReader} from '~/Manager/AdminManager';
import type {BoardRepository, RetroRow} from '~/Repository/BoardRepository';
import {ConflictHttpError, ForbiddenHttpError} from '~/Error/HttpError';
import {logger} from '~/logger';
import type {DieRoll} from '~/Model/WebSocketModel';
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
  'templateId',
  'templateName',
  'defaultTimerSeconds',
  'icebreakerQuestionId',
  'icebreakerAskedAt',
  'actionReview',
  'reviewFocusActionId',
] as const;

export const COALESCE_MS = 250;

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
  private readonly queues = new Map<string, {isDirty: boolean; pending: number; tail: Promise<unknown>}>();

  private readonly broadcastAt = new Map<string, number>();

  private readonly scheduled = new Map<string, ReturnType<typeof setTimeout>>();

  /** Set once the managers exist: the hub is built before them. Fails closed until then. */
  private authorize: Authorizer = async () => undefined;

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

  /**
   * Serialises a command against this board, then fans the new board out from the queue.
   * A board goes out at most every COALESCE_MS: the first one of a burst at once, the last one
   * always, through the queue, and a new phase at once. Thirty people sharing their notes at
   * once cost a few boards each, not thirty. A failed command still sends what the ones before
   * it changed.
   */
  public run<T>(retroId: string, work: () => Promise<T>): Promise<T> {
    return this.enqueue(retroId, work, false);
  }

  private async hasPhaseMoved(retroId: string): Promise<boolean> {
    const session = this.sessions.get(retroId);

    if (!session) {
      return false;
    }

    try {
      return (await this.loadRetro(retroId))?.phase !== session.knownPhase;
    } catch {
      return true;
    }
  }

  private enqueue<T>(retroId: string, work: () => Promise<T>, isUrgent: boolean): Promise<T> {
    const entry = this.queues.get(retroId) ?? {isDirty: false, pending: 0, tail: Promise.resolve()};

    entry.pending += 1;
    this.queues.set(retroId, entry);

    const next = entry.tail.then(async () => {
      try {
        const result = await work();

        entry.isDirty = true;

        return result;
      } finally {
        const wait = (this.broadcastAt.get(retroId) ?? 0) + COALESCE_MS - Date.now();
        const isDue =
          entry.isDirty && (wait <= 0 || isUrgent || (await this.hasPhaseMoved(retroId)));

        if (isDue) {
          entry.isDirty = false;
          this.markBroadcast(retroId);
          await this.notifyBoardChanged(retroId);
        } else if (entry.isDirty && entry.pending === 1) {
          this.scheduleBroadcast(retroId, wait);
        }
      }
    });

    const settle = (): void => {
      entry.pending -= 1;

      if (entry.pending === 0 && !entry.isDirty && this.queues.get(retroId) === entry) {
        this.queues.delete(retroId);
      }
    };

    entry.tail = next.then(settle, settle);

    return next;
  }

  private markBroadcast(retroId: string): void {
    const at = Date.now();

    this.broadcastAt.set(retroId, at);
    setTimeout(() => {
      if (this.broadcastAt.get(retroId) === at) {
        this.broadcastAt.delete(retroId);
      }
    }, COALESCE_MS).unref?.();
  }

  private scheduleBroadcast(retroId: string, wait: number): void {
    if (this.scheduled.has(retroId)) {
      return;
    }

    const timer = setTimeout(() => {
      this.scheduled.delete(retroId);
      this.run(retroId, async () => undefined).catch(() => undefined);
    }, wait);

    timer.unref?.();
    this.scheduled.set(retroId, timer);
  }

  public release(retroId: string, connection: Connection): void {
    const session = this.sessions.get(retroId);

    if (!session) {
      return;
    }

    session.remove(connection);

    if (session.size === 0) {
      session.dispose();
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

  /** A die belongs to somebody in the room: rolling needs the live session. */
  public rollDie(retroId: string, userId: string): DieRoll[] {
    const session = this.sessions.get(retroId);
    const outcome = session?.rollDie(userId) ?? 'absent';

    if (outcome === 'absent') {
      throw new ConflictHttpError('Join the retro to roll your die');
    }

    if (outcome === 'already-rolled') {
      throw new ConflictHttpError('You already rolled your die');
    }

    if (outcome === 'closed') {
      throw new ForbiddenHttpError('Dice are only rolled during the discussion');
    }

    return session!.rolls();
  }

  public resetDice(retroId: string): void {
    this.sessions.get(retroId)?.resetDice();
  }

  /** Backs the facilitation takeover rule without any storage (BEHAVIOUR.md section 5). */
  public isWatching(retroId: string, userId: string): boolean {
    return this.sessions.get(retroId)?.isWatching(userId) ?? false;
  }

  public get liveRetroCount(): number {
    return this.sessions.size;
  }

  /** The retros somebody is looking at right now; the hub does not know their team. */
  public liveRetroIds(): string[] {
    return [...this.sessions.keys()];
  }

  /**
   * Re-broadcasts boards a write elsewhere has changed. Each goes through its own retro's
   * queue: a bare notifyBoardChanged could overtake a command in flight and send an older read last.
   */
  public async refreshRetros(retroIds: Iterable<string>): Promise<void> {
    await Promise.all(
      [...retroIds].map((retroId) => this.enqueue(retroId, async () => undefined, true)),
    );
  }

  private async loadRetro(retroId: string): Promise<RetroRow | undefined> {
    return this.db
      .selectFrom('retros')
      .select(RETRO_COLUMNS)
      .where('id', '=', retroId)
      .executeTakeFirst();
  }
}
