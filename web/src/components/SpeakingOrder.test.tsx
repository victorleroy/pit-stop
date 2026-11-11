// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SpeakingOrder} from '@/components/SpeakingOrder';

const alice = {name: 'Alice', userId: 'u1'};
const bob = {name: 'Bob', userId: 'u2'};
const people = ['Carol', 'Dan', 'Eve'].map((name, index) => ({name, userId: `u${index + 3}`}));

const props = {
  isBusy: false,
  isFacilitator: false,
  myUserId: alice.userId,
  onReset: vi.fn(),
  onRoll: vi.fn(),
  participants: [alice, bob],
  spinningIds: [],
};

describe('SpeakingOrder', () => {
  afterEach(cleanup);

  it('ranks the settled rolls as received, in small numbered chips', () => {
    render(<SpeakingOrder {...props} rolls={[{...bob, value: 5}]} />);

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['1. Bob']);
    expect(screen.getByRole('button', {name: 'Roll your die'})).toBeTruthy();
  });

  it('lets me roll my own die only, once', () => {
    const onRoll = vi.fn();

    render(<SpeakingOrder {...props} onRoll={onRoll} rolls={[]} />);
    fireEvent.click(screen.getByRole('button', {name: 'Roll your die'}));

    expect(onRoll).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('disables my die while it spins and shows who else is rolling', () => {
    render(<SpeakingOrder {...props} rolls={[]} spinningIds={[alice.userId, bob.userId]} />);

    expect((screen.getByRole('button', {name: 'Rolling your die'}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('img', {name: 'Bob is rolling'})).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('shows the first ranks and the rest of the order behind +n', () => {
    const participants = [alice, bob, ...people];
    const rolls = [bob, ...people, alice].map((person, index) => ({...person, value: 6 - index}));

    render(<SpeakingOrder {...props} participants={participants} rolls={rolls} />);

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1. Bob',
      '2. Carol',
      '3. Dan',
    ]);
    expect(screen.getByRole('img', {name: 'Order complete'})).toBeTruthy();

    fireEvent.click(screen.getByRole('button', {name: 'Show the full order'}));
    const full = within(screen.getByRole('list', {name: 'Full speaking order'}));

    expect(full.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Bob · 6',
      'Carol · 5',
      'Dan · 4',
      'Eve · 3',
      'Alice · 2',
    ]);
  });

  it('lets the facilitator alone reset the dice once somebody rolled', () => {
    const rolls = [{...bob, value: 2}];
    const {rerender} = render(<SpeakingOrder {...props} rolls={rolls} />);

    expect(screen.queryByRole('button', {name: 'Reset the dice'})).toBeNull();

    const onReset = vi.fn();

    rerender(<SpeakingOrder {...props} isFacilitator onReset={onReset} rolls={rolls} />);
    fireEvent.click(screen.getByRole('button', {name: 'Reset the dice'}));

    expect(onReset).toHaveBeenCalledOnce();
  });
});
