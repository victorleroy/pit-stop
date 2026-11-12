import type {GameCar, GameScore, GameWheel} from '~/Model/WebSocketModel';

/** Arena units: the pit lane is 1 wide, a car is CAR_LENGTH long and enters fully hidden. */
export const CAR_LENGTH = 0.12;
export const WHEEL_OFFSETS: Record<GameWheel, number> = {front: 0.095, rear: 0.025};
export const HIT_TOLERANCE_MS = 300;
export const GAME_CHUNK_MS = 10_000;
export const MAX_CARS_ON_TRACK = 8;
export const SPEED_RANGE = [0.11, 0.25] as const;
export const LANES = 3;
export const LIVERIES = 12;

const FIRST_CHUNK_LEAD_MS = 1000;
const CHUNK_LEAD_MS = 2000;
const CHUNK_HORIZON_MS = 12_000;

/** Mean gap between two cars, shrinking as more people play, jittered by ±40%. */
export const nextSpawnGap = (players: number, rng: () => number): number => {
  const mean = Math.min(2200, Math.max(700, 2200 - 50 * players));

  return mean * (0.6 + 0.8 * rng());
};

/** When a car's x reaches a given value, x(t) = -CAR_LENGTH + speed * (t - spawnAt) / 1000. */
const timeAtX = (car: GameCar, x: number): number =>
  car.spawnAt + ((x + CAR_LENGTH) / car.speed) * 1000;

const exitTime = (car: GameCar): number => timeAtX(car, 1);

/** The wheel is on screen from its x = 0 to its x = 1, with some slack for latency. */
export const wheelWindow = (car: GameCar, wheel: GameWheel): [number, number] => [
  timeAtX(car, -WHEEL_OFFSETS[wheel]) - HIT_TOLERANCE_MS,
  timeAtX(car, 1 - WHEEL_OFFSETS[wheel]) + HIT_TOLERANCE_MS,
];

interface Player {
  name: string;
  pictureUrl?: string;
  userId: string;
}

interface TrackedCar extends GameCar {
  /** userIds who tried a wheel, one attempt each: retrying is never useful (anti-cheat). */
  attempts: Set<string>;
  taken: Partial<Record<GameWheel, string>>;
}

export interface GameHit {
  carId: number;
  name: string;
  pictureUrl?: string;
  points: number;
  serviced: boolean;
  teamStops: number;
  userId: string;
  wheel: GameWheel;
}

export interface GameSnapshot {
  cars: (GameCar & {taken: Partial<Record<GameWheel, string>>})[];
  scores: GameScore[];
  teamStops: number;
}

/**
 * The Wheel Gun of the waiting room (ADR 0006): a schedule of cars drawn here and sent ahead,
 * each client moving them with the same pure kinematics, and every hit judged here. Nothing is
 * persisted: the game ends with its RetroSession.
 */
export class LobbyGame {
  private readonly cars = new Map<number, TrackedCar>();

  private readonly scores = new Map<string, Player & {points: number; reachedAt: number}>();

  private nextCarId = 1;

  private nextSpawnAt: number | undefined;

  private scoreChanges = 0;

  private teamStops = 0;

  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly rng: () => number = () => Math.random(),
  ) {}

  /** The service clock every `serverNow` is read from. */
  public time(): number {
    return this.now();
  }

  public get isRunning(): boolean {
    return this.timer !== undefined;
  }

  /**
   * Sends a first chunk at once, then one every GAME_CHUNK_MS. `players` is read at each chunk,
   * so the pace follows who is playing.
   */
  public start(players: () => number, onSpawns: (cars: GameCar[]) => void): void {
    if (this.timer) {
      return;
    }

    onSpawns(this.chunk(players(), FIRST_CHUNK_LEAD_MS));
    this.timer = setInterval(() => onSpawns(this.chunk(players(), CHUNK_LEAD_MS)), GAME_CHUNK_MS);
    // A lobby game never keeps the process alive on shutdown.
    this.timer.unref?.();
  }

  /** Nobody plays: no more cars, but the scores stay while the session lives. */
  public pause(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  public stop(): void {
    this.pause();
    this.cars.clear();
    this.scores.clear();
    this.teamStops = 0;
    this.nextSpawnAt = undefined;
  }

  /** Cars due in [now + lead, now + CHUNK_HORIZON_MS[, the cap and the lanes permitting. */
  public chunk(players: number, lead: number = CHUNK_LEAD_MS): GameCar[] {
    const now = this.now();
    const from = now + lead;
    const until = now + CHUNK_HORIZON_MS;
    const spawned: GameCar[] = [];

    this.purge(now);

    let at = Math.max(this.nextSpawnAt ?? from, from);

    while (at < until) {
      const car = this.place(Math.floor(at));

      if (car) {
        spawned.push(car);
      }

      at += nextSpawnGap(Math.max(1, players), this.rng);
    }

    this.nextSpawnAt = at;

    return spawned;
  }

  /** Undefined means ignored: whatever the reason, the client learns nothing. */
  public hit(player: Player, carId: unknown, wheel: unknown): GameHit | undefined {
    if (wheel !== 'front' && wheel !== 'rear') {
      return undefined;
    }

    const car = typeof carId === 'number' ? this.cars.get(carId) : undefined;

    if (!car || car.taken[wheel]) {
      return undefined;
    }

    const attempt = `${player.userId}:${wheel}`;

    if (car.attempts.has(attempt)) {
      return undefined;
    }

    car.attempts.add(attempt);

    const now = this.now();
    const [opens, closes] = wheelWindow(car, wheel);

    if (now < opens || now > closes) {
      return undefined;
    }

    car.taken[wheel] = player.userId;
    this.award(player, 1);

    const serviced = Boolean(car.taken.front && car.taken.rear);

    if (serviced) {
      this.teamStops += 1;

      for (const userId of new Set(Object.values(car.taken))) {
        const contributor = this.scores.get(userId);

        if (contributor) {
          this.award(contributor, 1);
        }
      }
    }

    return {
      carId: car.id,
      name: player.name,
      ...(player.pictureUrl ? {pictureUrl: player.pictureUrl} : {}),
      points: this.scores.get(player.userId)!.points,
      serviced,
      teamStops: this.teamStops,
      userId: player.userId,
      wheel,
    };
  }

  public snapshot(): GameSnapshot {
    this.purge(this.now());

    return {
      cars: [...this.cars.values()].map(({attempts: _attempts, ...car}) => ({
        ...car,
        taken: {...car.taken},
      })),
      scores: this.ranking(),
      teamStops: this.teamStops,
    };
  }

  /** Points first, then whoever got there first. */
  public ranking(): GameScore[] {
    return [...this.scores.values()]
      .sort((left, right) => right.points - left.points || left.reachedAt - right.reachedAt)
      .map(({name, pictureUrl, points, userId}) => ({
        name,
        ...(pictureUrl ? {pictureUrl} : {}),
        points,
        userId,
      }));
  }

  private award(player: Player, points: number): void {
    const current = this.scores.get(player.userId);

    this.scores.set(player.userId, {
      name: player.name,
      ...(player.pictureUrl ? {pictureUrl: player.pictureUrl} : {}),
      points: (current?.points ?? 0) + points,
      reachedAt: (this.scoreChanges += 1),
      userId: player.userId,
    });
  }

  /** A car gone past its last hittable instant, and its attempts, are forgotten. */
  private purge(now: number): void {
    for (const car of this.cars.values()) {
      if (exitTime(car) + HIT_TOLERANCE_MS < now) {
        this.cars.delete(car.id);
      }
    }
  }

  private place(spawnAt: number): GameCar | undefined {
    const onTrack = [...this.cars.values()].filter(
      (car) => car.spawnAt <= spawnAt && exitTime(car) > spawnAt,
    );

    if (onTrack.length >= MAX_CARS_ON_TRACK) {
      return undefined;
    }

    const [slowest, fastest] = SPEED_RANGE;
    const speed = slowest + (fastest - slowest) * this.rng();
    const candidate = {id: 0, lane: 0 as GameCar['lane'], livery: 0, spawnAt, speed};
    const free = ([0, 1, 2] as const).filter((lane) => {
      const ahead = [...this.cars.values()]
        .filter((car) => car.lane === lane)
        .sort((left, right) => right.spawnAt - left.spawnAt)[0];

      return !ahead || LobbyGame.neverCatches(ahead, {...candidate, lane});
    });

    if (!free.length) {
      return undefined;
    }

    const car: TrackedCar = {
      attempts: new Set(),
      id: this.nextCarId++,
      lane: free[Math.min(free.length - 1, Math.floor(this.rng() * free.length))]!,
      livery: Math.min(LIVERIES - 1, Math.floor(this.rng() * LIVERIES)),
      spawnAt,
      speed,
      taken: {},
    };

    this.cars.set(car.id, car);

    const {attempts: _attempts, taken: _taken, ...visible} = car;

    return visible;
  }

  /**
   * The gap between two cars of a lane changes linearly, so checking it when the second one
   * enters and when the first one leaves covers the whole time they share the lane.
   */
  public static neverCatches(ahead: GameCar, behind: GameCar): boolean {
    const gapAt = (t: number): number =>
      ahead.speed * (t - ahead.spawnAt) - behind.speed * (t - behind.spawnAt);
    const leaves = exitTime(ahead);

    if (leaves <= behind.spawnAt) {
      return true;
    }

    // In thousandths of an arena width: one car length between their noses, at both ends.
    return gapAt(behind.spawnAt) >= CAR_LENGTH * 1000 && gapAt(leaves) >= CAR_LENGTH * 1000;
  }
}
