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

  const renderEditable = (onTextChange = vi.fn()) => {
    render(
      <ActionList
        actions={[action]}
        canComplete={false}
        canCreate={false}
        emptyLabel=""
        isBusy={false}
        members={[]}
        onStatusChange={vi.fn()}
        onTextChange={onTextChange}
        title="Actions"
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit this action'));
    return onTextChange;
  };

  it('saves the edited text on Enter, trimmed', () => {
    const onTextChange = renderEditable();
    fireEvent.change(screen.getByLabelText('Action text'), {target: {value: '  Fix the CI  '}});
    fireEvent.keyDown(screen.getByLabelText('Action text'), {key: 'Enter'});
    expect(onTextChange).toHaveBeenCalledWith('a', 'Fix the CI');
    expect(screen.queryByLabelText('Action text')).toBeNull();
  });

  it('saves with the check button', () => {
    const onTextChange = renderEditable();
    fireEvent.change(screen.getByLabelText('Action text'), {target: {value: 'Fix the CI'}});
    fireEvent.click(screen.getByLabelText('Save this action'));
    expect(onTextChange).toHaveBeenCalledWith('a', 'Fix the CI');
  });

  it('cancels on Escape without saving', () => {
    const onTextChange = renderEditable();
    fireEvent.change(screen.getByLabelText('Action text'), {target: {value: 'Other'}});
    fireEvent.keyDown(screen.getByLabelText('Action text'), {key: 'Escape'});
    expect(onTextChange).not.toHaveBeenCalled();
    expect(screen.getByText('Fix CI')).toBeTruthy();
  });

  it('offers no edit without a text handler', () => {
    render(
      <ActionList
        actions={[action]}
        canCreate={false}
        emptyLabel=""
        isBusy={false}
        members={[]}
        onStatusChange={vi.fn()}
        title="Actions"
      />,
    );
    expect(screen.queryByLabelText('Edit this action')).toBeNull();
  });
});
