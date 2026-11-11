// @vitest-environment jsdom
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {FollowThrough} from '@/components/FollowThrough';
import type {ActionStats, TrendPoint} from '@/api/types';

const point = (retroTitle: string, rate: number | null, current = false): TrendPoint => ({
  createdAt: '2026-11-01T00:00:00.000Z',
  current,
  done: 1,
  dropped: 0,
  kept: 1,
  rate,
  retroId: retroTitle,
  retroTitle,
});

const stats = (overrides: Partial<ActionStats> = {}): ActionStats => ({
  completionTrend: [],
  doneSinceLastRetro: 0,
  droppedSinceLastRetro: 0,
  openCount: 0,
  ...overrides,
});

describe('FollowThrough', () => {
  afterEach(cleanup);

  it('stays hidden while there is nothing to report', () => {
    const {container} = render(<FollowThrough stats={stats()} />);

    expect(container.innerHTML).toBe('');
  });

  it('sums up the closings and the trend, in words as well as bars', () => {
    render(
      <FollowThrough
        stats={stats({
          completionTrend: [point('Sprint 41', 0.5), point('Sprint 42', null, true)],
          doneSinceLastRetro: 2,
          openCount: 3,
        })}
      />,
    );

    expect(screen.getByText('Follow-through')).toBeTruthy();
    expect(
      screen.getByRole('img', {name: 'Completion rate over last 2 retros: 50%, none'}),
    ).toBeTruthy();
    expect(screen.queryByText('Trend appears after two reviews')).toBeNull();
  });

  it('says the trend needs two reviews', () => {
    render(<FollowThrough stats={stats({completionTrend: [point('Sprint 42', 1)], openCount: 1})} />);

    expect(screen.getByText('Trend appears after two reviews')).toBeTruthy();
  });
});
