import type {GameCar} from '~/Model/WebSocketModel';
import {
  CAR_LENGTH,
  GAME_CHUNK_MS,
  HIT_TOLERANCE_MS,
  LobbyGame,
  MAX_CARS_ON_TRACK,
  nextSpawnGap,
  wheelWindow,
} from '~/Realtime/LobbyGame';

/** A seeded generator, so a failure replays the same schedule. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;

  return seed / 2 ** 32;
};

const exit = (car: GameCar) => car.spawnAt + ((1 + CAR_LENGTH) / car.speed) * 1000;

const victor = {name: 'Victor', userId: 'usr_victor'};
const alice = {name: 'Alice', pictureUrl: 'https://img.test/a.png', userId: 'usr_alice'};

/** ADR 0006: the schedule and the judge of the waiting-room game. */
describe('LobbyGame', () => {
  let clock: number;
  let game: LobbyGame;

  const at = (time: number) => {
    clock = time;
  };

  /** A single car the test controls, through the same path as a real chunk. */
  const firstCar = (): GameCar => {
    const car = game.chunk(1, 1000)[0];

    if (!car) {
      throw new Error('no car drawn');
    }

    return car;
  };

  beforeEach(() => {
    clock = 1_000_000;
    game = new LobbyGame(() => clock, seeded(42));
  });

  afterEach(() => game.stop());

  it('draws the gap between cars from the number of players, ±40%', () => {
    expect(nextSpawnGap(1, () => 0)).toBe(2150 * 0.6);
    expect(nextSpawnGap(1, () => 1)).toBeCloseTo(2150 * 1.4);
    expect(nextSpawnGap(30, () => 0)).toBe(420);
    expect(nextSpawnGap(30, () => 1)).toBeCloseTo(980);
    expect(nextSpawnGap(100, () => 0.5)).toBe(700);

    const rng = seeded(7);

    for (let index = 0; index < 1000; index += 1) {
      const gap = nextSpawnGap(30, rng);

      expect(gap).toBeGreaterThanOrEqual(420);
      expect(gap).toBeLessThanOrEqual(980);
    }
  });

  it('never has more than 8 cars on the track at once', () => {
    const cars: GameCar[] = [];

    for (let chunk = 0; chunk < 30; chunk += 1) {
      cars.push(...game.chunk(500, chunk ? 2000 : 1000));
      at(clock + GAME_CHUNK_MS);
    }

    for (const {spawnAt} of cars) {
      const visible = cars.filter((car) => car.spawnAt <= spawnAt && exit(car) > spawnAt);

      expect(visible.length).toBeLessThanOrEqual(MAX_CARS_ON_TRACK);
    }

    // At 500 players the gap floor (700 ms) would put more on the track: some draws are skipped.
    expect(cars.length).toBeLessThan((30 * GAME_CHUNK_MS) / 700);
  });

  it('never lets a car catch the one ahead in its lane', () => {
    const cars: GameCar[] = [];

    for (let chunk = 0; chunk < 100; chunk += 1) {
      cars.push(...game.chunk(30, chunk ? 2000 : 1000));
      at(clock + GAME_CHUNK_MS);
    }

    expect(cars.length).toBeGreaterThan(1000);

    for (const lane of [0, 1, 2]) {
      const inLane = cars.filter((car) => car.lane === lane).sort((a, b) => a.spawnAt - b.spawnAt);

      inLane.slice(1).forEach((behind, index) => {
        expect(LobbyGame.neverCatches(inLane[index]!, behind)).toBe(true);
      });
    }
  });

  it('refuses a car that would catch the one ahead', () => {
    const slow: GameCar = {id: 1, lane: 0, livery: 0, spawnAt: 0, speed: 0.11};

    expect(LobbyGame.neverCatches(slow, {...slow, id: 2, spawnAt: 2000, speed: 0.25})).toBe(false);
    expect(LobbyGame.neverCatches(slow, {...slow, id: 2, spawnAt: 2000, speed: 0.11})).toBe(true);
    expect(LobbyGame.neverCatches(slow, {...slow, id: 2, spawnAt: 500, speed: 0.11})).toBe(false);
  });

  it('covers [now + 2 s, now + 12 s[ per chunk, and [now + 1 s, now + 12 s[ first', () => {
    const first = game.chunk(1, 1000);

    expect(first.length).toBeGreaterThan(0);
    first.forEach(({spawnAt}) => {
      expect(spawnAt).toBeGreaterThanOrEqual(clock + 1000);
      expect(spawnAt).toBeLessThan(clock + 12_000);
    });
    expect(first[0]!.spawnAt).toBe(clock + 1000);

    at(clock + GAME_CHUNK_MS);

    const next = game.chunk(1);

    next.forEach(({spawnAt}) => {
      expect(spawnAt).toBeGreaterThanOrEqual(clock + 2000);
      expect(spawnAt).toBeLessThan(clock + 12_000);
    });
  });

  it('gives a wheel to the first hit only', () => {
    const car = firstCar();

    at(car.spawnAt + 3000);

    expect(game.hit(victor, car.id, 'rear')).toMatchObject({
      carId: car.id,
      points: 1,
      serviced: false,
      userId: victor.userId,
      wheel: 'rear',
    });
    expect(game.hit(alice, car.id, 'rear')).toBeUndefined();
  });

  it('rewards every contributor of a full pit stop, and counts it for the team', () => {
    const shared = firstCar();

    at(shared.spawnAt + 3000);
    game.hit(victor, shared.id, 'rear');

    expect(game.hit(alice, shared.id, 'front')).toMatchObject({points: 2, serviced: true, teamStops: 1});
    // Both reach 2 on the same stop; the bonus goes out in the order the wheels were taken.
    expect(game.ranking()).toEqual([
      {...victor, points: 2},
      {...alice, points: 2},
    ]);

    const solo = game.snapshot().cars.find((car) => car.id !== shared.id)!;

    at(solo.spawnAt + 3000);
    game.hit(victor, solo.id, 'rear');

    expect(game.hit(victor, solo.id, 'front')).toMatchObject({points: 5, teamStops: 2});
  });

  it('accepts a hit only while the wheel is on screen, give or take 300 ms', () => {
    const car = firstCar();
    const [opens, closes] = wheelWindow(car, 'front');

    expect(opens).toBeCloseTo(car.spawnAt + ((CAR_LENGTH - 0.095) / car.speed) * 1000 - HIT_TOLERANCE_MS);

    at(opens - 1);
    expect(game.hit(victor, car.id, 'front')).toBeUndefined();
    at(opens);
    expect(game.hit(alice, car.id, 'front')).toBeDefined();

    const [, rearCloses] = wheelWindow(car, 'rear');

    at(rearCloses + 1);
    expect(game.hit(alice, car.id, 'rear')).toBeUndefined();

    const other = game.snapshot().cars.find(({id}) => id !== car.id)!;
    const [, otherCloses] = wheelWindow(other, 'rear');

    at(otherCloses);
    expect(game.hit(victor, other.id, 'rear')).toBeDefined();
    expect(closes).toBeGreaterThan(opens);
  });

  it('allows one attempt per person, wheel and car, and forgets them with the car', () => {
    const car = firstCar();

    at(car.spawnAt - 1000);
    expect(game.hit(victor, car.id, 'rear')).toBeUndefined();
    at(car.spawnAt + 3000);
    expect(game.hit(victor, car.id, 'rear')).toBeUndefined();
    expect(game.hit(alice, car.id, 'rear')).toBeDefined();

    at(exit(car) + HIT_TOLERANCE_MS + 1);
    expect(game.snapshot().cars.map(({id}) => id)).not.toContain(car.id);
  });

  it('ignores an unknown car or wheel without throwing', () => {
    const car = firstCar();

    at(car.spawnAt + 3000);

    expect(game.hit(victor, 9999, 'rear')).toBeUndefined();
    expect(game.hit(victor, car.id, 'left')).toBeUndefined();
    expect(game.hit(victor, String(car.id), 'rear')).toBeUndefined();
    expect(game.hit(victor, car.id, 'rear')).toBeDefined();
  });

  it('ranks by points, then by who got there first', () => {
    const cars = game.chunk(1, 1000);
    const [one, two] = cars;

    at(two!.spawnAt + 3000);
    game.hit(alice, one!.id, 'rear');
    game.hit(victor, two!.id, 'rear');

    expect(game.ranking().map(({userId}) => userId)).toEqual([alice.userId, victor.userId]);

    game.hit(victor, two!.id, 'front');

    expect(game.ranking().map(({userId, points}) => [userId, points])).toEqual([
      [victor.userId, 3],
      [alice.userId, 1],
    ]);
  });

  it('leaves no timer behind once stopped', () => {
    jest.useFakeTimers();

    try {
      const sent: GameCar[][] = [];
      const timed = new LobbyGame(() => clock, seeded(1));

      timed.start(() => 1, (cars) => sent.push(cars));
      expect(sent).toHaveLength(1);

      at(clock + GAME_CHUNK_MS);
      jest.advanceTimersByTime(GAME_CHUNK_MS);
      expect(sent).toHaveLength(2);

      timed.stop();

      expect(timed.isRunning).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
      expect(timed.snapshot()).toEqual({cars: [], scores: [], teamStops: 0});
    } finally {
      jest.useRealTimers();
    }
  });
});
