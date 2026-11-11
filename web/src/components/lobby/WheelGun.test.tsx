// @vitest-environment jsdom
import {ThemeProvider} from '@mui/material/styles';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import type {ComponentProps} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {WheelGun} from '@/components/lobby/WheelGun';
import {theme} from '@/ui/theme';
import {playWrenchClack, saveTimerMuted} from '@/utils/timerSound';

vi.mock('@/utils/timerSound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/timerSound')>()),
  playWrenchClack: vi.fn(),
  unlockTimerSound: vi.fn(),
}));

const game = (overrides: Record<string, unknown> = {}) =>
  ({
    addEffectListener: () => () => undefined,
    handleEvent: vi.fn(),
    isFree: () => true,
    model: {current: {attempted: new Set(), cars: new Map(), pending: new Map(), taken: new Map()}},
    now: () => Date.now(),
    scores: [],
    tap: vi.fn(() => true),
    teamStops: 0,
    ...overrides,
  }) as unknown as ComponentProps<typeof WheelGun>['game'];

const renderGun = (props: Partial<ComponentProps<typeof WheelGun>> = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <WheelGun game={game()} isConnected participants={[]} userId="me" {...props} />
    </ThemeProvider>,
  );

describe('WheelGun', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('draws an accessible arena with the hint while nobody scored', () => {
    renderGun();

    const arena = screen.getByRole('img', {
      name: 'Wheel Gun game, press 1, 2 or 3 to fit the furthest free wheel of that lane',
    });

    expect(arena.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('heading', {name: 'Wheel Gun'})).toBeTruthy();
    expect(screen.getByText('Pit stops: 0')).toBeTruthy();
    expect(screen.getByText('Tap a wheel to fit it. Finish both wheels for a full pit stop.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('is always on, with neither a game switch nor a sound switch', () => {
    renderGun();

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('fits the most advanced wheel of the lane wherever it is on the track', () => {
    const tap = vi.fn(() => true);
    // Front wheel at x = 0.9: well past the middle of the track.
    const car = {id: 4, lane: 2, livery: 0, spawnAt: 0, speed: 0.2};
    const at = ((0.9 + 0.12 - 0.095) / 0.2) * 1000;
    renderGun({
      game: game({
        model: {current: {attempted: new Set(), cars: new Map([[4, car]]), pending: new Map(), taken: new Map()}},
        now: () => at,
        tap,
      }),
    });

    fireEvent.keyDown(screen.getByRole('img'), {key: '3'});
    expect(tap).toHaveBeenCalledWith(4, 'front');
  });

  it('plays the impact sound unless the timer sound is muted', () => {
    vi.mocked(playWrenchClack).mockClear();
    saveTimerMuted(true);
    const car = {id: 4, lane: 0, livery: 0, spawnAt: 0, speed: 0.2};
    const at = ((0.5 + 0.12 - 0.095) / 0.2) * 1000;
    renderGun({
      game: game({
        model: {current: {attempted: new Set(), cars: new Map([[4, car]]), pending: new Map(), taken: new Map()}},
        now: () => at,
      }),
    });

    fireEvent.keyDown(screen.getByRole('img'), {key: '1'});
    expect(playWrenchClack).not.toHaveBeenCalled();

    saveTimerMuted(false);
    fireEvent.keyDown(screen.getByRole('img'), {key: '1'});
    expect(playWrenchClack).toHaveBeenCalledTimes(1);
  });

  it('gives the focus back on Escape', () => {
    renderGun();
    const arena = screen.getByRole('img');

    arena.focus();
    expect(document.activeElement).toBe(arena);

    fireEvent.keyDown(arena, {key: 'Escape'});
    expect(document.activeElement).not.toBe(arena);
  });

  it('fits nothing while the socket is down', () => {
    const tap = vi.fn(() => true);
    renderGun({game: game({tap}), isConnected: false});

    fireEvent.keyDown(screen.getByRole('img'), {key: '2'});
    expect(tap).not.toHaveBeenCalled();
  });
});
