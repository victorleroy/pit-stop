// @vitest-environment jsdom
import {cleanup, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import type {GameScore} from '@/api/types';
import {GameScoreboard} from '@/components/lobby/GameScoreboard';

const score = (userId: string, points: number): GameScore => ({name: `Player ${userId}`, points, userId});

const scores = (count: number) => Array.from({length: count}, (_, index) => score(`u${index}`, count - index));

const names = () =>
  within(screen.getAllByRole('rowgroup')[1])
    .getAllByRole('row')
    .map((row) => row.querySelector('td:nth-child(2) > div > :last-child')?.textContent);

describe('GameScoreboard', () => {
  afterEach(cleanup);

  it('stays hidden until somebody scored', () => {
    render(<GameScoreboard scores={[]} />);
    expect(screen.queryByRole('table')).toBeNull();

    cleanup();
    render(<GameScoreboard scores={[score('a', 0)]} />);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows everybody in a table when there are at most five players', () => {
    render(<GameScoreboard myUserId="u1" scores={scores(3)} />);

    expect(names()).toEqual(['Player u0', 'Player u1 (you)', 'Player u2']);
    expect(screen.queryByText(/others/)).toBeNull();
  });

  it('shows the top five, my row when I am further down, then the others', () => {
    render(<GameScoreboard myUserId="u7" scores={scores(10)} />);

    expect(names()).toEqual(['Player u0', 'Player u1', 'Player u2', 'Player u3', 'Player u4', 'Player u7 (you)']);
    expect(screen.getByText('+4 others')).toBeTruthy();
  });

  it('keeps the order it is given, which breaks ties by who got there first', () => {
    render(<GameScoreboard scores={[score('late', 3), score('later', 3), score('first', 2)]} />);

    expect(names()).toEqual(['Player late', 'Player later', 'Player first']);
  });

  it('prefers the identity of the presence over the one of the hit', () => {
    render(
      <GameScoreboard
        participants={[{name: 'Renamed', userId: 'a'}]}
        scores={[score('a', 2)]}
      />,
    );

    expect(screen.getByText('Renamed')).toBeTruthy();
    expect(screen.queryByText('Player a')).toBeNull();
  });

  it('has no live region', () => {
    const {container} = render(<GameScoreboard scores={scores(2)} />);

    expect(container.querySelector('[aria-live]')).toBeNull();
  });
});
