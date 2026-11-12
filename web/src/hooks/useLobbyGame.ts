import {useCallback, useEffect, useRef, useState} from 'react';
import type {GameCar, GameEvent, GameScore, GameWheel} from '@/api/types';
import {CAR_LENGTH} from '@/utils/wheelGunModel';

/** A tap nobody confirmed within this delay is given up on locally. */
export const PENDING_TIMEOUT_MS = 1_000;

// A car is forgotten once it left the arena, with room for a late hit still in flight.
const FORGET_AFTER_EXIT_MS = 1_500;

export type GameEffect =
  | {at: number; carId: number; kind: 'spark'; userId: string; wheel: GameWheel}
  | {at: number; carId: number; kind: 'serviced'};

export interface GameModel {
  attempted: Set<string>;
  cars: Map<number, GameCar>;
  pending: Map<string, number>;
  /** Wheel key to the userId that fitted it. */
  taken: Map<string, string>;
}

export const wheelKey = (carId: number, wheel: GameWheel) => `${carId}:${wheel}`;

const emptyModel = (): GameModel => ({
  attempted: new Set(),
  cars: new Map(),
  pending: new Map(),
  taken: new Map(),
});

/** Keeps the order the service gives: points first, then whoever got there first. */
export const upsertScore = (scores: GameScore[], score: GameScore) => {
  const others = scores.filter(({userId}) => userId !== score.userId);
  let index = others.length;

  while (index > 0 && others[index - 1].points < score.points) index -= 1;

  return [...others.slice(0, index), score, ...others.slice(index)];
};

export const podiumMessage = (scores: GameScore[], teamStops: number) =>
  `Pit stop record: ${teamStops} ${teamStops === 1 ? 'stop' : 'stops'} · 1st ${scores[0].name} ${scores[0].points}`;

interface Options {
  isActive: boolean;
  isConnected: boolean;
  onEnded?: (podium: {scores: GameScore[]; teamStops: number}) => void;
  send: (payload: object) => void;
  userId?: string;
}

/**
 * Everything the waiting-room game knows, fed by the `game.*` events of the board socket. The
 * moving parts (cars, who fitted which wheel) live in a ref the canvas reads every frame; only
 * what the page prints is React state.
 */
export const useLobbyGame = ({isActive, isConnected, onEnded, send, userId}: Options) => {
  const [scores, setScores] = useState<GameScore[]>([]);
  const [teamStops, setTeamStops] = useState(0);
  const model = useRef<GameModel>(emptyModel());
  const offset = useRef(0);
  const listeners = useRef(new Set<(effect: GameEffect) => void>());
  const timers = useRef(new Set<number>());
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const sendRef = useRef(send);
  sendRef.current = send;

  const now = useCallback(() => Date.now() + offset.current, []);

  const emit = useCallback((effect: GameEffect) => {
    listeners.current.forEach((listener) => listener(effect));
  }, []);

  const addEffectListener = useCallback((listener: (effect: GameEffect) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const prune = useCallback(() => {
    const at = now();

    model.current.cars.forEach((car, id) => {
      if (at < car.spawnAt + ((1 + CAR_LENGTH) / car.speed) * 1000 + FORGET_AFTER_EXIT_MS) return;

      model.current.cars.delete(id);
      (['front', 'rear'] as const).forEach((wheel) => {
        const key = wheelKey(id, wheel);
        model.current.taken.delete(key);
        model.current.pending.delete(key);
        model.current.attempted.delete(key);
      });
    });
  }, [now]);

  const reset = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
    model.current = emptyModel();
  }, []);

  const handleEvent = useCallback(
    (event: GameEvent) => {
      if ('serverNow' in event) offset.current = event.serverNow - Date.now();

      if (event.type === 'game.state') {
        reset();
        event.cars.forEach(({taken, ...car}) => {
          model.current.cars.set(car.id, car);
          if (taken.front) model.current.taken.set(wheelKey(car.id, 'front'), taken.front);
          if (taken.rear) model.current.taken.set(wheelKey(car.id, 'rear'), taken.rear);
        });
        prune();
        setScores(event.scores);
        setTeamStops(event.teamStops);
      }

      if (event.type === 'game.spawns') {
        event.cars.forEach((car) => model.current.cars.set(car.id, car));
        prune();
      }

      if (event.type === 'game.hit') {
        const key = wheelKey(event.carId, event.wheel);
        const wasMyPending = model.current.pending.has(key);
        const isMine = event.userId === userIdRef.current;
        const partner = model.current.taken.get(
          wheelKey(event.carId, event.wheel === 'front' ? 'rear' : 'front'),
        );

        model.current.pending.delete(key);
        model.current.taken.set(key, event.userId);

        // My own tap already sparked when it was made: the confirmation only settles it.
        if (!(isMine && wasMyPending)) {
          emit({at: Date.now(), carId: event.carId, kind: 'spark', userId: event.userId, wheel: event.wheel});
        }

        if (event.serviced) emit({at: Date.now(), carId: event.carId, kind: 'serviced'});

        setScores((current) => {
          const other =
            event.serviced && partner && partner !== event.userId
              ? current.find(({userId}) => userId === partner)
              : undefined;
          const withPartner = other ? upsertScore(current, {...other, points: other.points + 1}) : current;

          return upsertScore(withPartner, {
            name: event.name,
            pictureUrl: event.pictureUrl,
            points: event.points,
            userId: event.userId,
          });
        });
        setTeamStops(event.teamStops);
      }

      if (event.type === 'game.ended') {
        reset();
        setScores(event.scores);
        setTeamStops(event.teamStops);

        if (event.scores.some(({points}) => points > 0)) {
          onEndedRef.current?.({scores: event.scores, teamStops: event.teamStops});
        }
      }
    },
    [emit, prune, reset],
  );

  const isFree = useCallback((carId: number, wheel: GameWheel) => {
    const key = wheelKey(carId, wheel);
    const {attempted, pending, taken} = model.current;

    return !taken.has(key) && !pending.has(key) && !attempted.has(key);
  }, []);

  const tap = useCallback(
    (carId: number, wheel: GameWheel) => {
      const key = wheelKey(carId, wheel);

      if (!userIdRef.current || !isFree(carId, wheel)) return false;

      model.current.attempted.add(key);
      model.current.pending.set(key, Date.now());
      emit({at: Date.now(), carId, kind: 'spark', userId: userIdRef.current, wheel});
      sendRef.current({action: 'game.hit', carId, wheel});

      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        model.current.pending.delete(key);
      }, PENDING_TIMEOUT_MS);
      timers.current.add(timer);

      return true;
    },
    [emit, isFree],
  );

  const isPlaying = isActive && isConnected;

  useEffect(() => {
    if (!isPlaying) return undefined;

    sendRef.current({action: 'game.join'});

    return () => {
      sendRef.current({action: 'game.leave'});
      reset();
    };
  }, [isPlaying, reset]);

  useEffect(() => reset, [reset]);

  return {addEffectListener, handleEvent, isFree, model, now, scores, tap, teamStops};
};
