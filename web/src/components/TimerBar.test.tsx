// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TimerControls} from '@/components/TimerBar';
import type {Timer} from '@/api/types';

const chime = vi.hoisted(() => vi.fn());

vi.mock('@/utils/timerSound', async (original) => ({
  ...(await original<typeof import('@/utils/timerSound')>()),
  playTimerChime: chime,
  unlockTimerSound: vi.fn(),
}));

const running = {state: 'RUNNING', remainingMs: 3000, totalMs: 3000} as Timer;

const renderTimer = (timer: Timer = running) =>
  render(
    <TimerControls
      isBusy={false}
      isFacilitator={false}
      onTimer={vi.fn()}
      receivedAt={Date.now()}
      timer={timer}
    />,
  );

describe('TimerControls sound', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    chime.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('rings once when the countdown reaches zero', () => {
    renderTimer();
    act(() => void vi.advanceTimersByTime(2500));
    expect(chime).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(5000));
    expect(chime).toHaveBeenCalledTimes(1);
  });

  it('stays silent on a timer that is already over', () => {
    renderTimer({state: 'RUNNING', remainingMs: 0, totalMs: 3000} as Timer);
    act(() => void vi.advanceTimersByTime(5000));
    expect(chime).not.toHaveBeenCalled();
  });

  it('stays silent when muted, and remembers the choice', () => {
    renderTimer();
    fireEvent.click(screen.getByLabelText('Mute the timer sound'));
    expect(window.localStorage.getItem('pit-stop.timer-muted')).toBe('1');
    act(() => void vi.advanceTimersByTime(5000));
    expect(chime).not.toHaveBeenCalled();
    cleanup();
    renderTimer();
    expect(screen.getByLabelText('Unmute the timer sound')).toBeTruthy();
  });
});
