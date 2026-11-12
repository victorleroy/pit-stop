import {describe, expect, it} from 'vitest';
import {presenceOrder, speakingOrder} from '@/utils/speakingOrder';

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

describe('presenceOrder', () => {
  const dan = {name: 'Dan', userId: 'dan'};

  it('keeps the presence as it came before anybody rolled', () => {
    expect(presenceOrder([alice, bob, carol], [])).toEqual([alice, bob, carol]);
  });

  it('puts whoever rolled first, ranked as the service sent, then the others as they came', () => {
    const rolls = [
      {...carol, value: 4},
      {...alice, value: 4},
    ];

    expect(presenceOrder([alice, bob, carol, dan], rolls)).toEqual([
      {...carol, rank: 1, value: 4},
      {...alice, rank: 2, value: 4},
      bob,
      dan,
    ]);
  });

  it('ranks the people in the room only, with the face they show now', () => {
    const rolls = [
      {...dan, value: 6},
      {...bob, name: 'Old Bob', value: 3},
    ];

    expect(presenceOrder([alice, bob], rolls)).toEqual([{...bob, rank: 1, value: 3}, alice]);
  });
});
