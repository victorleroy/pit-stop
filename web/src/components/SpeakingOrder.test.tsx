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
};

describe('SpeakingOrder', () => {
  afterEach(cleanup);

  it('ranks the rolls as received, then the people still to roll', () => {
    render(<SpeakingOrder {...props} rolls={[{...bob, value: 5}]} />);

    const items = screen.getAllByRole('listitem').map((item) => item.textContent);

    expect(items).toEqual(['1. Bob', 'You']);
  });

  it('lets me roll my own die only', () => {
    const onRoll = vi.fn();

    render(<SpeakingOrder {...props} onRoll={onRoll} rolls={[]} />);
    fireEvent.click(screen.getByRole('button', {name: 'Roll your die'}));

    expect(onRoll).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('button')).toHaveLength(1);
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
