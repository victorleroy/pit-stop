const ZOOM_KEY = 'pit-stop.board-zoom';

export const ZOOM_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5];

export const DEFAULT_ZOOM = 1;

export const stepZoom = (zoom: number, direction: -1 | 1) => {
  const index = ZOOM_LEVELS.indexOf(zoom);
  const current = index === -1 ? ZOOM_LEVELS.indexOf(DEFAULT_ZOOM) : index;
  return ZOOM_LEVELS[Math.min(Math.max(current + direction, 0), ZOOM_LEVELS.length - 1)];
};

// Storage can be missing or refuse access (private mode, blocked site data): the board then
// simply opens at 100%.
export const readZoom = () => {
  try {
    const stored = window.localStorage.getItem(ZOOM_KEY);
    const value = Number(stored);
    if (stored === null || stored === '' || !Number.isFinite(value)) return DEFAULT_ZOOM;
    return ZOOM_LEVELS.reduce((best, level) =>
      Math.abs(level - value) < Math.abs(best - value) ? level : best,
    );
  } catch {
    return DEFAULT_ZOOM;
  }
};

export const saveZoom = (zoom: number) => {
  try {
    window.localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {
    // Nothing to do: the zoom just will not survive a reload.
  }
};
