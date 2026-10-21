import type {WebSocket} from 'ws';
import type {Container} from '~/container';
import {logger} from '~/logger';
import type {Connection} from '~/Realtime/RetroSession';

/**
 * The browser cannot set headers on a websocket, but it can name subprotocols: the client
 * offers `[SOCKET_PROTOCOL, token]` and the service answers with `SOCKET_PROTOCOL` alone.
 * A query string would put a 30-day session token in every proxy access log.
 */
export const SOCKET_PROTOCOL = 'pit-stop';

export const tokenFromProtocols = (header: string | undefined): string | undefined => {
  const offered = (header ?? '').split(',').map((protocol) => protocol.trim());

  if (!offered.includes(SOCKET_PROTOCOL)) {
    return undefined;
  }

  return offered.find((protocol) => protocol && protocol !== SOCKET_PROTOCOL);
};

const isFraction = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/**
 * A connection lives inside exactly one RetroSession (ADR D1). Subscribing is what creates
 * the actor; the last participant leaving is what destroys it.
 */
export const createSocketAttacher =
  (container: Container) =>
  async (socket: WebSocket, token: string): Promise<void> => {
    const auth = await container.authManager.resolveSession(token);

    if (!auth) {
      socket.send(JSON.stringify({message: 'Invalid or expired session', type: 'error'}));
      socket.close();
      return;
    }

    let connection: Connection | undefined;
    let retroId: string | undefined;
    let isClosed = false;
    // Access checks resolve in any order: only the latest subscribe may attach the socket.
    let latestSubscribe = 0;

    const leave = (): void => {
      if (retroId && connection) {
        container.hub.release(retroId, connection);
      }

      connection = undefined;
      retroId = undefined;
    };

    const subscribe = async (target: string): Promise<void> => {
      latestSubscribe += 1;

      const attempt = latestSubscribe;

      try {
        await container.retroManager.getBoard(auth, target);
      } catch (error: unknown) {
        logger.warn({err: error, retroId: target}, 'Websocket subscription refused');
        socket.send(JSON.stringify({message: 'Retro not accessible', type: 'error'}));
        return;
      }

      // The socket may have closed, or asked for another retro, while access was checked.
      if (isClosed || attempt !== latestSubscribe) {
        return;
      }

      // One socket follows one retro: switching retro leaves the previous one.
      leave();

      retroId = target;
      connection = {
        name: auth.name,
        ...(auth.pictureUrl ? {pictureUrl: auth.pictureUrl} : {}),
        socket,
        token,
        userId: auth.userId,
      };

      const session = container.hub.acquire(retroId);

      session.add(connection);
      await session.broadcastBoard();
      session.broadcastPresence();
    };

    socket.on('message', (raw) => {
      let payload: {action?: unknown; retroId?: unknown; x?: unknown; y?: unknown};

      try {
        payload = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (payload.action === 'subscribe' && typeof payload.retroId === 'string') {
        subscribe(payload.retroId).catch((error: unknown) =>
          logger.error({err: error}, 'Websocket subscription failed'),
        );
        return;
      }

      if (payload.action === 'cursor' && retroId && connection) {
        container.hub
          .get(retroId)
          ?.relayCursor(
            connection,
            isFraction(payload.x) && isFraction(payload.y) ? {x: payload.x, y: payload.y} : undefined,
          );
      }
    });

    socket.on('close', () => {
      isClosed = true;
      leave();
    });

    socket.on('error', () => socket.close());
  };
