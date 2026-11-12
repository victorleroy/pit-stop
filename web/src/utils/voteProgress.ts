import type {Board, Participant} from '@/api/types';

/** Who in the room has spent their whole budget: the votes themselves stay secret. */
export const voteProgress = (board: Board, participants: Participant[]) => {
  const used = (userId: string) => Math.min(board.maxVotes, board.voteProgress[userId] ?? 0);

  return {
    done: participants.filter(({userId}) => used(userId) >= board.maxVotes).length,
    total: participants.length,
    used,
  };
};
