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

describe('TimerControls duration', () => {
  afterEach(() => cleanup());

  const renderIdle = (onTimer = vi.fn()) => {
    render(
      <TimerControls
        isBusy={false}
        isFacilitator
        onTimer={onTimer}
        receivedAt={Date.now()}
        timer={{state: 'IDLE'} as Timer}
      />,
    );
    return onTimer;
  };

  const openPicker = () => fireEvent.click(screen.getByLabelText('Choose the timer duration'));

  it('starts the timer with the chosen preset', () => {
    const onTimer = renderIdle();
    openPicker();
    fireEvent.click(screen.getByRole('button', {name: '3 min'}));
    expect(onTimer).toHaveBeenCalledWith('start', 180);
  });

  it('clamps a custom duration to the service limits', () => {
    const onTimer = renderIdle();
    openPicker();
    fireEvent.change(screen.getByLabelText('Minutes'), {target: {value: '90'}});
    fireEvent.click(screen.getByRole('button', {name: 'Start'}));
    expect(onTimer).toHaveBeenLastCalledWith('start', 3600);
  });

  it('keeps a custom duration above the minimum', () => {
    const onTimer = renderIdle();
    openPicker();
    fireEvent.change(screen.getByLabelText('Minutes'), {target: {value: '0.01'}});
    fireEvent.click(screen.getByRole('button', {name: 'Start'}));
    expect(onTimer).toHaveBeenLastCalledWith('start', 5);
  });

  it('does not start a custom duration left empty', () => {
    renderIdle();
    openPicker();
    expect((screen.getByRole('button', {name: 'Start'}) as HTMLButtonElement).disabled).toBe(true);
  });
});
