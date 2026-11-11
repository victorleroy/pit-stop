import {describe, expect, it} from 'vitest';
import {speakingOrder} from '@/utils/speakingOrder';

const alice = {name: 'Alice', userId: 'alice'};
const bob = {name: 'Bob', userId: 'bob'};
const carol = {name: 'Carol', userId: 'carol'};

describe('speakingOrder', () => {
  it('keeps the ranking the service sent, ties included', () => {
    const rolls = [
      {...bob, value: 5},
      {...alice, value: 5},
      {...carol, value: 2},
    ];

    expect(speakingOrder(rolls, [alice, bob, carol]).order.map(({userId}) => userId)).toEqual([
      'bob',
      'alice',
      'carol',
    ]);
  });

  it('waits for everybody in the room who has not rolled yet', () => {
    const {isComplete, waiting} = speakingOrder([{...alice, value: 3}], [alice, bob, carol]);

    expect(waiting.map(({userId}) => userId)).toEqual(['bob', 'carol']);
    expect(isComplete).toBe(false);
  });

  it('is complete once everybody connected rolled, whoever left the room', () => {
    const rolls = [
      {...carol, value: 6},
      {...alice, value: 3},
    ];

    expect(speakingOrder(rolls, [alice]).isComplete).toBe(true);
  });

  it('is not complete before anybody rolled', () => {
    expect(speakingOrder([], []).isComplete).toBe(false);
    expect(speakingOrder([], [alice]).isComplete).toBe(false);
  });
});
