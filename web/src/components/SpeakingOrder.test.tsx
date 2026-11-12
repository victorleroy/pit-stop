// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SpeakingOrder} from '@/components/SpeakingOrder';

const alice = {name: 'Alice', userId: 'u1'};
const bob = {name: 'Bob', userId: 'u2'};

const props = {
  isBusy: false,
  isFacilitator: false,
  myUserId: alice.userId,
  onReset: vi.fn(),
  onRoll: vi.fn(),
  participants: [alice, bob],
  rolls: [],
  spinningIds: [],
};

describe('SpeakingOrder', () => {
  afterEach(cleanup);

  it('lets me roll my own die only, once', () => {
    const onRoll = vi.fn();

    render(<SpeakingOrder {...props} onRoll={onRoll} rolls={[{...bob, value: 5}]} />);
    fireEvent.click(screen.getByRole('button', {name: 'Roll your die'}));

    expect(onRoll).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('disables my die while it spins', () => {
    render(<SpeakingOrder {...props} spinningIds={[alice.userId]} />);

    expect((screen.getByRole('button', {name: 'Rolling your die'}) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows my face on the die once it stopped, held or settled, and no button any more', () => {
    const {rerender} = render(<SpeakingOrder {...props} held={{...alice, value: 4}} />);

    expect(screen.getByRole('img', {name: 'You rolled 4'})).toBeTruthy();
    expect(screen.queryByRole('button', {name: 'Roll your die'})).toBeNull();

    rerender(<SpeakingOrder {...props} rolls={[{...alice, value: 4}]} />);

    expect(screen.getByRole('img', {name: 'You rolled 4'})).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a check once everybody in the room rolled', () => {
    const rolls = [
      {...bob, value: 6},
      {...alice, value: 2},
    ];
    const {rerender} = render(<SpeakingOrder {...props} rolls={rolls.slice(0, 1)} />);

    expect(screen.queryByRole('img', {name: 'Order complete'})).toBeNull();

    rerender(<SpeakingOrder {...props} rolls={rolls} />);

    expect(screen.getByRole('img', {name: 'Order complete'})).toBeTruthy();
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
