import type {WebSocket} from 'ws';
import {DICE_PHASE, RetroManager} from '~/Manager/RetroManager';
import type {DieRoll, PresenceParticipant, WebSocketEvent} from '~/Model/WebSocketModel';
import type {BoardRepository, RetroRow} from '~/Repository/BoardRepository';
import {logger} from '~/logger';
import type {RetroPhase} from '~/Db/schema';

const CURSOR_HIDDEN_PHASES: RetroPhase[] = ['BRAINSTORM', 'VOTE'];

export type RollOutcome = 'absent' | 'already-rolled' | 'closed' | 'rolled';

export interface Connection {
  name: string;
  pictureUrl?: string;
  socket: WebSocket;
  /** Kept to re-check access before every board: a session or a membership can end mid-retro. */
  token: string;
  userId: string;
}

/**
 * Whether this session token still opens this retro, resolved from the store every time. The
 * identity comes back with the answer, so a renamed participant shows under the new name.
 */
export type Authorizer = (
  token: string,
  retroId: string,
) => Promise<{name: string; pictureUrl?: string} | undefined>;

/**
 * The authoritative actor for one retro (ADR-001 D1).
 *
 * It owns the open connections and fans out; SessionHub serialises the work on the board. The
 * database stays the source of truth: this object holds no durable state, so losing it to a
 * restart costs a reconnection and nothing else.
 *
 * Holding the connections next to the state is what makes the fan-out a loop rather than a
 * service, and what gives commands their order without any coordination.
 */
export class RetroSession {
  private readonly connections = new Set<Connection>();

  private phase: RetroPhase | undefined;

  /** One die per person, held here only: it ends with the session or with the DISCUSS phase. */
  private readonly dice = new Map<string, DieRoll & {tieBreak: number}>();

  public constructor(
    public readonly retroId: string,
    private readonly boardRepository: BoardRepository,
    private readonly loadRetro: () => Promise<RetroRow | undefined>,
    private readonly authorize: Authorizer,
  ) {}

  public get size(): number {
    return this.connections.size;
  }

  public isWatching(userId: string): boolean {
    for (const connection of this.connections) {
      if (connection.userId === userId) {
        return true;
      }
    }

    return false;
  }

  public add(connection: Connection): void {
    this.connections.add(connection);
  }

  public remove(connection: Connection): void {
    this.connections.delete(connection);
  }

  /**
   * One board read, then one projection per recipient: the anonymity rules of
   * RetroManager.projectBoard are the only ones that ever reach a client.
   */
  public async broadcastBoard(): Promise<void> {
    if (!this.connections.size) {
      return;
    }

    const retro = await this.loadRetro();

    if (!retro) {
      for (const connection of [...this.connections]) {
        this.send(connection, {message: 'This retro was deleted', type: 'error'});
      }

      return;
    }

    this.phase = retro.phase;

    if (this.phase !== DICE_PHASE && this.dice.size) {
      this.resetDice();
    }

    const data = await this.boardRepository.loadBoard(retro);
    const recipients = [...this.connections];
    const allowed = await Promise.all(
      recipients.map((connection) => this.authorize(connection.token, this.retroId)),
    );
    const evicted = new Set<string>();
    let renamed = false;

    recipients.forEach((connection, index) => {
      const identity = allowed[index];

      if (!identity) {
        // Removed from the team, signed out, or suspended: the next board is not theirs.
        this.send(connection, {message: 'Retro not accessible', type: 'error'});
        this.connections.delete(connection);
        connection.socket.close();
        evicted.add(connection.userId);
        return;
      }

      if (connection.name !== identity.name || connection.pictureUrl !== identity.pictureUrl) {
        connection.name = identity.name;

        if (identity.pictureUrl) {
          connection.pictureUrl = identity.pictureUrl;
        } else {
          delete connection.pictureUrl;
        }

        renamed = true;
      }

      this.send(connection, {
        board: RetroManager.projectBoard(data, connection.userId),
        type: 'board.updated',
      });
    });

    if (evicted.size || renamed) {
      this.broadcastPresence();

      const dropped = [...evicted].filter((userId) => !this.isWatching(userId) && this.dice.delete(userId));

      if (dropped.length) {
        this.broadcastDice();
      }
    }
  }

  public broadcastPresence(): void {
    const participants = this.participants();

    for (const connection of [...this.connections]) {
      this.send(connection, {participants, type: 'presence.updated'});
    }
  }

  /** Each person rolls their own die, once; the tie-breaker is drawn now and never sent. */
  public rollDie(userId: string, random: () => number = Math.random): RollOutcome {
    if (this.phase !== DICE_PHASE) {
      return 'closed';
    }

    if (this.dice.has(userId)) {
      return 'already-rolled';
    }

    const participant = this.participants().find((candidate) => candidate.userId === userId);

    if (!participant) {
      return 'absent';
    }

    this.dice.set(userId, {...participant, tieBreak: random(), value: Math.floor(random() * 6) + 1});
    this.broadcastDice();

    return 'rolled';
  }

  public resetDice(): void {
    this.dice.clear();
    this.broadcastDice();
  }

  /** Highest first; equal faces keep the order their hidden tie-breakers gave them. */
  public rolls(): DieRoll[] {
    return [...this.dice.values()]
      .sort((left, right) => right.value - left.value || right.tieBreak - left.tieBreak)
      .map(({tieBreak: _tieBreak, ...roll}) => roll);
  }

  /** Somebody joining after the first roll sees the dice too. */
  public sendDice(connection: Connection): void {
    if (this.dice.size) {
      this.send(connection, {rolls: this.rolls(), snapshot: true, type: 'dice.updated'});
    }
  }

  /**
   * Cursors never touch the store: they are relayed straight to the other connections, so a
   * mouse move costs no write and no read. They are not relayed while people write or vote:
   * where others write or vote must not show.
   */
  public relayCursor(origin: Connection, position?: {x: number; y: number}): void {
    if (!this.phase || CURSOR_HIDDEN_PHASES.includes(this.phase)) {
      return;
    }

    const event: WebSocketEvent = position
      ? {cursor: {name: origin.name, userId: origin.userId, ...position}, type: 'cursor.moved'}
      : {type: 'cursor.left', userId: origin.userId};

    for (const connection of [...this.connections]) {
      if (connection !== origin) {
        this.send(connection, event);
      }
    }
  }

  public sendTo(connection: Connection, event: WebSocketEvent): void {
    this.send(connection, event);
  }

  private broadcastDice(): void {
    const rolls = this.rolls();

    for (const connection of [...this.connections]) {
      this.send(connection, {rolls, type: 'dice.updated'});
    }
  }

  private participants(): PresenceParticipant[] {
    return [
      ...new Map<string, PresenceParticipant>(
        [...this.connections].map((connection) => [
          connection.userId,
          {
            name: connection.name,
            ...(connection.pictureUrl ? {pictureUrl: connection.pictureUrl} : {}),
            userId: connection.userId,
          },
        ]),
      ).values(),
    ].sort((left, right) => left.name.localeCompare(right.name));
  }

  private send(connection: Connection, event: WebSocketEvent): void {
    if (connection.socket.readyState !== connection.socket.OPEN) {
      this.connections.delete(connection);
      return;
    }

    try {
      connection.socket.send(JSON.stringify(event));
    } catch (error: unknown) {
      logger.warn({err: error, retroId: this.retroId}, 'Dropping a connection that cannot be written to');
      this.connections.delete(connection);
    }
  }
}
