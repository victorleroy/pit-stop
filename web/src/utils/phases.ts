import type {RetroPhase} from '@/api/types';

export const OPENING_PHASES: readonly string[] = ['LOBBY', 'ICEBREAKER', 'REVIEW'];

/** Mirror of the service's `COLUMN_PHASES`. */
export const COLUMN_EDIT_PHASES: RetroPhase[] = ['LOBBY', 'BRAINSTORM'];

export type NextOpeningPhase = 'ICEBREAKER' | 'REVIEW' | 'BRAINSTORM';

type OpeningBoard = {
  phase: RetroPhase | 'REVIEW';
  icebreaker?: unknown;
  review?: {enabled: boolean; items: unknown[]};
};

/** False until the service accepts the REVIEW phase (lot R3). */
export const IS_REVIEW_PHASE_AVAILABLE = false;

/** From LOBBY: ICEBREAKER, then REVIEW, then BRAINSTORM; from ICEBREAKER: REVIEW, then BRAINSTORM. */
export const nextOpeningPhase = (
  board: OpeningBoard,
  isReviewAvailable: boolean = IS_REVIEW_PHASE_AVAILABLE,
): NextOpeningPhase => {
  const hasIcebreaker = board.icebreaker !== undefined && board.icebreaker !== null;
  const hasReview = isReviewAvailable && Boolean(board.review?.enabled && board.review.items.length > 0);

  if (board.phase === 'LOBBY' && hasIcebreaker) return 'ICEBREAKER';
  if ((board.phase === 'LOBBY' || board.phase === 'ICEBREAKER') && hasReview) return 'REVIEW';

  return 'BRAINSTORM';
};
