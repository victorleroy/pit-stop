import {describe, expect, it} from 'vitest';
import {USER_PALETTE, userColour} from '@/utils/userColour';

describe('userColour', () => {
  it('is stable for a given user', () => {
    expect(userColour('user-1')).toBe(userColour('user-1'));
  });

  it('spreads users over the whole palette', () => {
    const used = new Set(
      Array.from({length: 200}, (_, index) => userColour(`4f1c2a9e-${index}`)),
    );

    expect(used.size).toBe(USER_PALETTE.length);
  });

  it('separates users whose ids differ by one character', () => {
    expect(new Set(['u1', 'u2', 'u3', 'u4', 'u5'].map(userColour)).size).toBeGreaterThan(2);
  });
});
