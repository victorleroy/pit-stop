import type {WebSocket} from 'ws';
import {RetroManager} from '~/Manager/RetroManager';
import type {PresenceParticipant, WebSocketEvent} from '~/Model/WebSocketModel';
import type {BoardRepository, RetroRow} from '~/Repository/BoardRepository';
import {logger} from '~/logger';

export interface Connection {
  name: string;
  pictureUrl?: string;
  socket: WebSocket;
  /** Kept to re-check access before every board: a session or a membership can end mid-retro. */
  token: string;
  userId: string;
}

/** Whether this session token still opens this retro, resolved from the store every time. */
export type Authorizer = (token: string, retroId: string) => Promise<boolean>;

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

    const data = await this.boardRepository.loadBoard(retro);
    const recipients = [...this.connections];
    const allowed = await Promise.all(
      recipients.map((connection) => this.authorize(connection.token, this.retroId)),
    );
    let evicted = false;

    recipients.forEach((connection, index) => {
      if (!allowed[index]) {
        // Removed from the team, signed out, or suspended: the next board is not theirs.
        this.send(connection, {message: 'Retro not accessible', type: 'error'});
        this.connections.delete(connection);
        connection.socket.close();
        evicted = true;
        return;
      }

      this.send(connection, {
        board: RetroManager.projectBoard(data, connection.userId),
        type: 'board.updated',
      });
    });

    if (evicted) {
      this.broadcastPresence();
    }
  }

  public broadcastPresence(): void {
    const participants = [
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

    for (const connection of [...this.connections]) {
      this.send(connection, {participants, type: 'presence.updated'});
    }
  }

  /**
   * Cursors never touch the store: they are relayed straight to the other connections, so a
   * mouse move costs no write and no read.
   */
  public relayCursor(origin: Connection, position?: {x: number; y: number}): void {
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
