// @vitest-environment jsdom
import {cleanup, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Board} from '@/api/types';
import {PresenceBar} from '@/components/PresenceBar';

const alice = {name: 'Alice', userId: 'u1'};
const bob = {name: 'Bob', userId: 'u2'};
const carol = {name: 'Carol', userId: 'u3'};

const board = {columns: [], maxVotes: 3, phase: 'DISCUSS'} as unknown as Board;

describe('PresenceBar', () => {
  afterEach(cleanup);

  it('lines the avatars up in speaking order, each roll ranked under its avatar', () => {
    render(
      <PresenceBar
        board={board}
        dice={{rolls: [{...carol, value: 5}], spinningIds: [bob.userId]}}
        isConnected
        participants={[alice, bob, carol]}
      />,
    );

    const order = within(screen.getByRole('list', {name: 'Speaking order'}));

    expect(order.getAllByRole('listitem').map((item) => item.getAttribute('data-user-id'))).toEqual([
      carol.userId,
      alice.userId,
      bob.userId,
    ]);
    expect(order.getByRole('img', {name: '1st, rolled 5'})).toBeTruthy();
    expect(order.getByRole('img', {name: 'Bob is rolling'})).toBeTruthy();
  });

  it('shows only the avatars while connected, and a chip only when the socket is down', () => {
    const {unmount} = render(<PresenceBar board={board} isConnected participants={[alice, bob]} />);

    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.queryByText(/online/)).toBeNull();
    expect(screen.queryByText('Reconnecting…')).toBeNull();
    unmount();

    render(<PresenceBar board={board} isConnected={false} participants={[alice, bob]} />);

    expect(screen.getByText('Reconnecting…')).toBeTruthy();
  });

  it('keeps the presence as it came, without dice, outside DISCUSS', () => {
    render(<PresenceBar board={board} isConnected participants={[alice, bob]} />);

    expect(screen.queryByRole('list', {name: 'Speaking order'})).toBeNull();
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(screen.queryByRole('img', {name: /rolled|rolling/})).toBeNull();
  });

  it('fits the avatars to the room it has and counts the rest', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe() {
          this.callback([{contentRect: {width: 100}} as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        disconnect() {}
      },
    );
    const crowd = Array.from({length: 10}, (_, index) => ({name: `Person ${index}`, userId: `p${index}`}));

    const {container} = render(<PresenceBar board={board} isConnected participants={crowd} />);

    expect(container.querySelectorAll('[data-user-id]')).toHaveLength(2);
    expect(screen.getByRole('img', {name: '8 more'}).textContent).toBe('+8');
    vi.unstubAllGlobals();
  });
});
