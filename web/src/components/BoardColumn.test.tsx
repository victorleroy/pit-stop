// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Column} from '@/api/types';
import {BoardColumn} from '@/components/BoardColumn';

const column = (prompt: string | null): Column => ({cards: [], id: 'c1', order: 0, prompt, title: 'Went well'});

const renderColumn = (prompt: string | null, canEditColumn = false) => {
  const onUpdatePrompt = vi.fn();

  render(
    <BoardColumn
      authorFilter={[]}
      canAddNote={false}
      canDecide={false}
      canEditColumn={canEditColumn}
      canGroup={false}
      canModerate={false}
      canRemove
      canReveal={false}
      canVote={false}
      canWrite={false}
      column={column(prompt)}
      index={0}
      isBusy={false}
      isFacilitator={canEditColumn}
      isLast
      onAddNote={vi.fn()}
      onGroupNote={vi.fn()}
      onMoveNote={vi.fn()}
      onRemoveColumn={vi.fn()}
      onRemoveNote={vi.fn()}
      onRenameCluster={vi.fn()}
      onRenameColumn={vi.fn()}
      onRevealNote={vi.fn()}
      onTurnIntoAction={vi.fn()}
      onUngroupNote={vi.fn()}
      onUpdateNote={vi.fn()}
      onUpdatePrompt={onUpdatePrompt}
      onVote={vi.fn()}
      ranks={new Map()}
      showTotals={false}
      votesLeft={0}
    />,
  );

  return onUpdatePrompt;
};

describe('BoardColumn prompt', () => {
  afterEach(cleanup);

  it('shows the prompt under the title', () => {
    renderColumn('What did the team do well?');
    expect(screen.getByText('What did the team do well?')).toBeTruthy();
  });

  it('shows nothing when there is no prompt', () => {
    renderColumn(null);
    expect(screen.queryByText('What did the team do well?')).toBeNull();
  });

  it('offers no way to edit it unless the column can be edited', () => {
    renderColumn('A prompt');
    expect(screen.queryByLabelText('Edit prompt')).toBeNull();
  });

  it('saves an edited prompt with Enter', () => {
    const onUpdatePrompt = renderColumn('Old', true);

    fireEvent.click(screen.getByLabelText('Edit prompt'));
    const input = screen.getByLabelText('Column prompt');
    expect((input as HTMLInputElement).maxLength).toBe(140);
    fireEvent.change(input, {target: {value: 'New'}});
    fireEvent.keyDown(input, {key: 'Enter'});

    expect(onUpdatePrompt).toHaveBeenCalledWith('New');
  });

  it('clears the prompt when it is emptied', () => {
    const onUpdatePrompt = renderColumn('Old', true);

    fireEvent.click(screen.getByLabelText('Edit prompt'));
    const input = screen.getByLabelText('Column prompt');
    fireEvent.change(input, {target: {value: '  '}});
    fireEvent.keyDown(input, {key: 'Enter'});

    expect(onUpdatePrompt).toHaveBeenCalledWith(null);
  });

  it('leaves the prompt alone on Escape', () => {
    const onUpdatePrompt = renderColumn('Old', true);

    fireEvent.click(screen.getByLabelText('Edit prompt'));
    const input = screen.getByLabelText('Column prompt');
    fireEvent.change(input, {target: {value: 'New'}});
    fireEvent.keyDown(input, {key: 'Escape'});

    expect(onUpdatePrompt).not.toHaveBeenCalled();
  });
});
