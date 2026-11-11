const ZOOM_KEY = 'pit-stop.board-zoom';

export const ZOOM_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];

export const DEFAULT_ZOOM = 1;

export const stepZoom = (zoom: number, direction: -1 | 1) => {
  const index = ZOOM_LEVELS.indexOf(zoom);
  const current = index === -1 ? ZOOM_LEVELS.length - 1 : index;
  return ZOOM_LEVELS[Math.min(Math.max(current + direction, 0), ZOOM_LEVELS.length - 1)];
};

// Storage can be missing or refuse access (private mode, blocked site data): the board then
// simply opens at 100%.
export const readZoom = () => {
  try {
    const value = Number(window.localStorage.getItem(ZOOM_KEY));
    return ZOOM_LEVELS.includes(value) ? value : DEFAULT_ZOOM;
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
