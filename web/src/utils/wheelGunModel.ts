import type {GameCar, GameWheel} from '@/api/types';

export const CAR_LENGTH = 0.12;

export const WHEEL_OFFSETS: Record<GameWheel, number> = {front: 0.095, rear: 0.025};

/** Same tolerance as the service: a hit is accepted this long around the visible window. */
export const HIT_TOLERANCE_MS = 300;

export const MIN_TOUCH_PX = 44;

export const LANES = [0, 1, 2] as const;

export interface Arena {
  height: number;
  width: number;
}

export const carX = (car: Pick<GameCar, 'spawnAt' | 'speed'>, at: number) =>
  -CAR_LENGTH + (car.speed * (at - car.spawnAt)) / 1000;

export const wheelX = (car: Pick<GameCar, 'spawnAt' | 'speed'>, wheel: GameWheel, at: number) =>
  carX(car, at) + WHEEL_OFFSETS[wheel];

const timeAtWheelX = (car: Pick<GameCar, 'spawnAt' | 'speed'>, wheel: GameWheel, x: number) =>
  car.spawnAt + ((x - WHEEL_OFFSETS[wheel] + CAR_LENGTH) / car.speed) * 1000;

/** Server-time window in which a wheel may be hit: from entering to leaving, plus tolerance. */
export const wheelWindow = (car: Pick<GameCar, 'spawnAt' | 'speed'>, wheel: GameWheel) => ({
  from: timeAtWheelX(car, wheel, 0) - HIT_TOLERANCE_MS,
  to: timeAtWheelX(car, wheel, 1) + HIT_TOLERANCE_MS,
});

export const isWheelVisible = (car: Pick<GameCar, 'spawnAt' | 'speed'>, wheel: GameWheel, at: number) => {
  const x = wheelX(car, wheel, at);
  return x >= 0 && x <= 1;
};

export const laneHeight = (arena: Arena) => arena.height / LANES.length;

/** Drawn radius, in proportion to the car; the tap target is bigger than this. */
export const wheelRadius = (arena: Arena) => arena.width * CAR_LENGTH * 0.14;

export const wheelPoint = (
  car: Pick<GameCar, 'lane' | 'spawnAt' | 'speed'>,
  wheel: GameWheel,
  at: number,
  arena: Arena,
) => ({
  x: wheelX(car, wheel, at) * arena.width,
  y: (car.lane + 0.5) * laneHeight(arena) + laneHeight(arena) * 0.2,
});

/**
 * The tap target is invisible and at least 44 CSS px square, centred on the wheel: a drawn
 * wheel is far too small for a thumb.
 */
export const touchHalfSize = (arena: Arena) => Math.max(MIN_TOUCH_PX, wheelRadius(arena) * 2) / 2;

export const hitTest = ({
  arena,
  at,
  cars,
  isFree,
  point,
}: {
  arena: Arena;
  at: number;
  cars: GameCar[];
  isFree: (carId: number, wheel: GameWheel) => boolean;
  point: {x: number; y: number};
}): {carId: number; wheel: GameWheel} | undefined => {
  const half = touchHalfSize(arena);
  let best: {carId: number; distance: number; wheel: GameWheel} | undefined;

  for (const car of cars) {
    for (const wheel of ['front', 'rear'] as const) {
      if (!isWheelVisible(car, wheel, at) || !isFree(car.id, wheel)) continue;

      const centre = wheelPoint(car, wheel, at, arena);
      const dx = Math.abs(point.x - centre.x);
      const dy = Math.abs(point.y - centre.y);

      if (dx > half || dy > half) continue;

      const distance = Math.hypot(dx, dy);
      if (!best || distance < best.distance) best = {carId: car.id, distance, wheel};
    }
  }

  return best ? {carId: best.carId, wheel: best.wheel} : undefined;
};

/** The free wheel of that lane furthest along the track, among those on screen, if any. */
export const pickKeyboardTarget = ({
  at,
  cars,
  isFree,
  lane,
}: {
  at: number;
  cars: GameCar[];
  isFree: (carId: number, wheel: GameWheel) => boolean;
  lane: number;
}): {carId: number; wheel: GameWheel} | undefined => {
  let best: {carId: number; wheel: GameWheel; x: number} | undefined;

  for (const car of cars) {
    if (car.lane !== lane) continue;

    for (const wheel of ['front', 'rear'] as const) {
      const x = wheelX(car, wheel, at);

      if (!isWheelVisible(car, wheel, at) || !isFree(car.id, wheel)) continue;
      if (!best || x > best.x) best = {carId: car.id, wheel, x};
    }
  }

  return best ? {carId: best.carId, wheel: best.wheel} : undefined;
};
