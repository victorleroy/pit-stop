const KEY = 'pit-stop.lobby-game';

export type LobbyGamePref = 'on' | 'off';

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const isReducedMotion = prefersReducedMotion;

// Storage can be missing or refuse access: the default then applies on every mount.
export const readLobbyGamePref = (): LobbyGamePref => {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored === 'on' || stored === 'off') return stored;
  } catch {
    // Falls through to the default.
  }

  return prefersReducedMotion() ? 'off' : 'on';
};

export const saveLobbyGamePref = (pref: LobbyGamePref) => {
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    // Nothing to do: the choice just will not survive a reload.
  }
};
