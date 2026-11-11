import {describe, expect, it} from 'vitest';
import type {Board} from '@/api/types';
import {voteProgress} from '@/utils/voteProgress';

const board = {maxVotes: 3, voteProgress: {alice: 3, bob: 1, gone: 3}} as unknown as Board;
const participants = [
  {name: 'Alice', userId: 'alice'},
  {name: 'Bob', userId: 'bob'},
  {name: 'Carol', userId: 'carol'},
];

describe('voteProgress', () => {
  it('counts only the connected participants who spent their whole budget', () => {
    const progress = voteProgress(board, participants);

    expect(progress.done).toBe(1);
    expect(progress.total).toBe(3);
  });

  it('gives each participant their votes used, zero when they have not voted', () => {
    const {used} = voteProgress(board, participants);

    expect(used('alice')).toBe(3);
    expect(used('bob')).toBe(1);
    expect(used('carol')).toBe(0);
  });
});
