import type {RetroPhase} from '@/api/types';

export const OPENING_PHASES: readonly string[] = ['LOBBY', 'ICEBREAKER', 'REVIEW'];

/** Mirror of the service's `COLUMN_PHASES`. */
export const COLUMN_EDIT_PHASES: RetroPhase[] = ['LOBBY', 'BRAINSTORM'];

export type NextOpeningPhase = 'ICEBREAKER' | 'REVIEW' | 'BRAINSTORM';

type OpeningBoard = {
  phase: RetroPhase | 'ICEBREAKER' | 'REVIEW';
  icebreaker?: unknown;
  review?: {enabled: boolean; items: unknown[]};
};

/** From LOBBY: ICEBREAKER, then REVIEW, then BRAINSTORM; from ICEBREAKER: REVIEW, then BRAINSTORM. */
export const nextOpeningPhase = (board: OpeningBoard): NextOpeningPhase => {
  const hasIcebreaker = board.icebreaker !== undefined && board.icebreaker !== null;
  const hasReview = Boolean(board.review?.enabled && board.review.items.length > 0);

  if (board.phase === 'LOBBY' && hasIcebreaker) return 'ICEBREAKER';
  if ((board.phase === 'LOBBY' || board.phase === 'ICEBREAKER') && hasReview) return 'REVIEW';

  return 'BRAINSTORM';
};
