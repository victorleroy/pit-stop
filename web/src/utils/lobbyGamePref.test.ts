// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import {readLobbyGamePref, saveLobbyGamePref} from '@/utils/lobbyGamePref';

const reducedMotion = (matches: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({matches: matches && query.includes('reduce')}));

describe('lobby game preference', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('is on by default and remembers what was chosen', () => {
    reducedMotion(false);
    expect(readLobbyGamePref()).toBe('on');

    saveLobbyGamePref('off');
    expect(readLobbyGamePref()).toBe('off');

    saveLobbyGamePref('on');
    expect(readLobbyGamePref()).toBe('on');
  });

  it('falls back to the default when storage throws', () => {
    reducedMotion(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readLobbyGamePref()).toBe('on');
    expect(() => saveLobbyGamePref('off')).not.toThrow();
  });

  it('is off with reduced motion when nothing was stored', () => {
    reducedMotion(true);

    expect(readLobbyGamePref()).toBe('off');
  });

  it('lets a stored choice win over reduced motion', () => {
    reducedMotion(true);
    saveLobbyGamePref('on');

    expect(readLobbyGamePref()).toBe('on');
  });
});
