export type TimerState = 'IDLE' | 'RUNNING' | 'PAUSED';

export interface TimerModel {
  /** Absolute deadline while running: every client counts down on its own from it. */
  endsAt?: string;
  /** What is left on the clock while paused. */
  remainingMs?: number;
  /** How long the round was set to run, so the board can draw how much is left of it. */
  totalMs?: number;
  state: TimerState;
}

export const TIMER_ACTIONS = ['start', 'pause', 'resume', 'extend', 'stop'] as const;

export type TimerAction = (typeof TIMER_ACTIONS)[number];
