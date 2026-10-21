import {describe, expect, it} from 'vitest';
import {initials} from '@/utils/initials';

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Victor Leroy')).toBe('VL');
    expect(initials('lea martin dupont')).toBe('LM');
  });

  it('falls back to the first two letters of a single word', () => {
    expect(initials('victor')).toBe('VI');
  });

  it('handles separators found in dev logins', () => {
    expect(initials('victor.leroy')).toBe('VL');
    expect(initials('victor-leroy')).toBe('VL');
  });

  it('never returns an empty badge', () => {
    expect(initials('')).toBe('?');
    expect(initials(undefined)).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});
