// @vitest-environment jsdom
import {ThemeProvider} from '@mui/material/styles';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import type {ComponentProps} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {WheelGun} from '@/components/lobby/WheelGun';
import {theme} from '@/ui/theme';

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
      <WheelGun game={game()} isConnected isOn onToggle={vi.fn()} participants={[]} userId="me" {...props} />
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
      name: 'Wheel Gun game, press 1, 2 or 3 to fit the nearest wheel in that lane',
    });

    expect(arena.getAttribute('tabindex')).toBe('0');
    expect(screen.getByText('Wheel Gun · On')).toBeTruthy();
    expect(screen.getByText('Pit stops: 0')).toBeTruthy();
    expect(screen.getByText('Tap a wheel to fit it. Finish both wheels for a full pit stop.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows a static box without canvas when the game is off, and turns it on from there', () => {
    const onToggle = vi.fn();
    renderGun({isOn: false, onToggle});

    expect(screen.getByText('Wheel Gun is off for you')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();

    fireEvent.click(screen.getByRole('button', {name: 'Turn on'}));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('exposes the sound switch of the timer', () => {
    renderGun();

    expect(screen.getByRole('switch', {name: 'Sounds'})).toBeTruthy();
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
