import type {BoardModel} from '~/Model/RetroModel';

export interface PresenceParticipant {
  name: string;
  pictureUrl?: string;
  userId: string;
}

/** One participant's die; the list comes ranked, highest first, ties already broken. */
export interface DieRoll extends PresenceParticipant {
  value: number;
}

/** Board-relative, as a fraction of its box: every screen is a different size. */
export interface CursorModel {
  name: string;
  userId: string;
  x: number;
  y: number;
}

export type GameWheel = 'front' | 'rear';

/** A car of the waiting-room game: where it is at any instant follows from these alone. */
export interface GameCar {
  id: number;
  lane: 0 | 1 | 2;
  livery: number;
  /** Epoch milliseconds, service clock. */
  spawnAt: number;
  /** Arena widths per second. */
  speed: number;
}

/** The shared identity shape, plus the player's total. */
export interface GameScore extends PresenceParticipant {
  points: number;
}

export type WebSocketEvent =
  | {board: BoardModel; type: 'board.updated'}
  | {cursor: CursorModel; type: 'cursor.moved'}
  | {participants: PresenceParticipant[]; type: 'presence.updated'}
  | {message: string; type: 'error'}
  | {rolls: DieRoll[]; snapshot?: boolean; type: 'dice.updated'}
  | {type: 'cursor.left'; userId: string}
  | {
      cars: (GameCar & {taken: Partial<Record<GameWheel, string>>})[];
      scores: GameScore[];
      serverNow: number;
      teamStops: number;
      type: 'game.state';
    }
  | {cars: GameCar[]; serverNow: number; type: 'game.spawns'}
  | {
      carId: number;
      name: string;
      pictureUrl?: string;
      /** The player's total, not a delta: a client that missed a hit catches up on the next. */
      points: number;
      serverNow: number;
      serviced: boolean;
      teamStops: number;
      type: 'game.hit';
      userId: string;
      wheel: GameWheel;
    }
  | {scores: GameScore[]; teamStops: number; type: 'game.ended'};
