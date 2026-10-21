import type {BoardModel} from '~/Model/RetroModel';

export interface PresenceParticipant {
  name: string;
  pictureUrl?: string;
  userId: string;
}

/** Board-relative, as a fraction of its box: every screen is a different size. */
export interface CursorModel {
  name: string;
  userId: string;
  x: number;
  y: number;
}

export type WebSocketEvent =
  | {board: BoardModel; type: 'board.updated'}
  | {cursor: CursorModel; type: 'cursor.moved'}
  | {participants: PresenceParticipant[]; type: 'presence.updated'}
  | {message: string; type: 'error'}
  | {type: 'cursor.left'; userId: string};
