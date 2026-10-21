import {useCallback, useEffect, useRef, useState} from 'react';
import {tokenStorage} from '@/api/client';
import type {Board, Cursor, Participant, ServerEvent} from '@/api/types';

// Must match the service: it answers this subprotocol and reads the token offered next to it.
const SOCKET_PROTOCOL = 'pit-stop';

const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];

/**
 * A pointer is sampled far more often than it needs to be sent: eight messages a second,
 * interpolated on arrival, already look continuous.
 */
const CURSOR_INTERVAL_MS = 120;

/** A pointer that went quiet is gone: a browser closing sends nothing. */
const CURSOR_TTL_MS = 8_000;

const CURSOR_SWEEP_MS = 2_000;

const socketUrl = () => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;

  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';

  return `${scheme}://${window.location.host}/ws`;
};

interface Options {
  onBoard: (board: Board) => void;
  retroId?: string;
}

type TimestampedCursor = Cursor & {at: number};

/**
 * Subscribes to the retro over websocket. The board is pushed by the service on every
 * change, so the page only falls back to polling while the socket is down.
 */
export const useBoardSocket = ({onBoard, retroId}: Options) => {
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [cursors, setCursors] = useState<TimestampedCursor[]>([]);
  const onBoardRef = useRef(onBoard);
  onBoardRef.current = onBoard;

  const socketRef = useRef<WebSocket | undefined>(undefined);
  const pendingCursorRef = useRef<{x: number; y: number} | undefined>(undefined);
  const lastCursorSentAtRef = useRef(0);
  const cursorTimerRef = useRef<number | undefined>(undefined);

  const send = (payload: object) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  };

  const flushCursor = useCallback(() => {
    const position = pendingCursorRef.current;
    pendingCursorRef.current = undefined;
    cursorTimerRef.current = undefined;

    if (!position) return;

    lastCursorSentAtRef.current = Date.now();
    send({action: 'cursor', ...position});
  }, []);

  const sendCursor = useCallback(
    (x: number, y: number) => {
      pendingCursorRef.current = {x, y};

      if (cursorTimerRef.current) return;

      const wait = Math.max(0, CURSOR_INTERVAL_MS - (Date.now() - lastCursorSentAtRef.current));
      cursorTimerRef.current = window.setTimeout(flushCursor, wait);
    },
    [flushCursor],
  );

  const hideCursor = useCallback(() => {
    pendingCursorRef.current = undefined;
    window.clearTimeout(cursorTimerRef.current);
    cursorTimerRef.current = undefined;
    send({action: 'cursor'});
  }, []);

  useEffect(() => {
    const token = tokenStorage.get();

    if (!retroId || !token) return undefined;

    let reconnectTimer: number | undefined;
    let attempt = 0;
    let cancelled = false;
    // A refused session or retro will be refused again: retrying only hammers the service.
    let refused = false;

    const connect = () => {
      // The token rides in the subprotocol list, never in the URL: proxies log URLs.
      const socket = new WebSocket(socketUrl(), [SOCKET_PROTOCOL, token]);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        attempt = 0;
        setIsConnected(true);
        socket.send(JSON.stringify({action: 'subscribe', retroId}));
      });

      socket.addEventListener('message', (event) => {
        const payload = JSON.parse(event.data as string) as ServerEvent;

        if (payload.type === 'board.updated') onBoardRef.current(payload.board);

        if (payload.type === 'error') refused = true;

        if (payload.type === 'presence.updated') {
          setParticipants(payload.participants);

          // Somebody who left the retro cannot leave a pointer behind.
          const present = new Set(payload.participants.map(({userId}) => userId));
          setCursors((current) => current.filter(({userId}) => present.has(userId)));
        }

        if (payload.type === 'cursor.moved') {
          const {cursor} = payload;

          setCursors((current) => [
            ...current.filter(({userId}) => userId !== cursor.userId),
            {...cursor, at: Date.now()},
          ]);
        }

        if (payload.type === 'cursor.left') {
          setCursors((current) => current.filter(({userId}) => userId !== payload.userId));
        }
      });

      socket.addEventListener('close', () => {
        // A socket closed by the cleanup must not wipe the state of the one replacing it.
        if (cancelled) return;

        setIsConnected(false);
        setParticipants([]);
        setCursors([]);

        if (refused) return;

        const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      });

      socket.addEventListener('error', () => socket.close());
    };

    connect();

    const sweep = window.setInterval(() => {
      const deadline = Date.now() - CURSOR_TTL_MS;

      setCursors((current) =>
        current.some(({at}) => at < deadline) ? current.filter(({at}) => at >= deadline) : current,
      );
    }, CURSOR_SWEEP_MS);

    return () => {
      cancelled = true;
      window.clearInterval(sweep);
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(cursorTimerRef.current);
      cursorTimerRef.current = undefined;
      socketRef.current?.close();
      socketRef.current = undefined;
    };
  }, [retroId]);

  return {cursors, hideCursor, isConnected, participants, sendCursor};
};
