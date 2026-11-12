import {describe, expect, it} from 'vitest';
import {SLIPSTREAM} from '@/ui/theme';
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

  it('only uses colours of the design system', () => {
    const themeColours = new Set<string>([...Object.values(SLIPSTREAM).flat()]);

    expect(USER_PALETTE.every((colour) => themeColours.has(colour))).toBe(true);
  });

  it('separates users whose ids differ by one character', () => {
    expect(new Set(['u1', 'u2', 'u3', 'u4', 'u5'].map(userColour)).size).toBeGreaterThan(2);
  });
});
