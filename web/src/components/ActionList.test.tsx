// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ActionList} from '@/components/ActionList';
import type {Action} from '@/api/types';

const action = {id: 'a', retroTitle: 'R', status: 'OPEN', text: 'Fix CI'} as Action;

describe('ActionList', () => {
  afterEach(cleanup);

  it('puts Drop before Done so the validating action is on the right', () => {
    const onStatusChange = vi.fn();
    render(
      <ActionList
        actions={[action]}
        canCreate={false}
        emptyLabel=""
        isBusy={false}
        members={[]}
        onStatusChange={onStatusChange}
        title="Actions"
      />,
    );
    const labels = screen.getAllByRole('button').map((button) => button.textContent);
    expect(labels.indexOf('Drop')).toBeLessThan(labels.indexOf('Done'));
    fireEvent.click(screen.getByText('Drop'));
    expect(onStatusChange).toHaveBeenCalledWith('a', 'DROPPED');
  });
});
