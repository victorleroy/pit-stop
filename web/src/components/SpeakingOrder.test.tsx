// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SpeakingOrder} from '@/components/SpeakingOrder';

const order = [
  {name: 'Bob', userId: 'u2'},
  {name: 'Alice', userId: 'u1'},
];

describe('SpeakingOrder', () => {
  afterEach(cleanup);

  it('lists the drawn order as received, numbered', () => {
    render(<SpeakingOrder canDraw={false} isBusy={false} onDraw={vi.fn()} order={order} />);

    const items = screen.getAllByRole('listitem').map((item) => item.textContent);

    expect(items).toEqual(['1. Bob', '2. Alice']);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lets the facilitator draw', () => {
    const onDraw = vi.fn();

    render(<SpeakingOrder canDraw isBusy={false} onDraw={onDraw} order={[]} />);
    fireEvent.click(screen.getByRole('button', {name: 'Draw speaking order'}));

    expect(onDraw).toHaveBeenCalledOnce();
  });

  it('shows nothing to a participant before any draw', () => {
    const {container} = render(
      <SpeakingOrder canDraw={false} isBusy={false} onDraw={vi.fn()} order={[]} />,
    );

    expect(container.innerHTML).toBe('');
  });
});
