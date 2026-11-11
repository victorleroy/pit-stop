import type {Board} from '@/api/types';

/** What the team still owes: open actions carried over plus those decided in this retro. */
export const countOpenActions = (board: Pick<Board, 'actions' | 'carriedOverActions'>) =>
  new Set(
    [...board.carriedOverActions, ...board.actions]
      .filter(({status}) => status === 'OPEN')
      .map(({id}) => id),
  ).size;
