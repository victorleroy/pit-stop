// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {NoteCard} from '@/components/NoteCard';
import type {Note} from '@/api/types';

const note = (changes: Partial<Note>) =>
  ({
    author: {id: 'u', name: 'Victor'},
    columnId: 'c',
    id: 'n',
    isMine: true,
    revealed: false,
    text: 'hello',
    ...changes,
  }) as Note;

const renderNote = (value: Note, onReveal = vi.fn()) => {
  render(
    <NoteCard
      canDrag={false}
      canEdit={false}
      canGroup={false}
      canRemove={false}
      canReveal
      columnIndex={0}
      isBusy={false}
      isClustered={false}
      isFacilitator
      note={value}
      onRemove={vi.fn()}
      onReveal={onReveal}
      onUngroup={vi.fn()}
      onUpdate={vi.fn()}
    />,
  );

  return onReveal;
};

describe('NoteCard', () => {
  afterEach(cleanup);

  it('shares one of my own notes on its own', () => {
    const onReveal = renderNote(note({}));
    fireEvent.click(screen.getByRole('button', {name: 'Share this note'}));
    expect(onReveal).toHaveBeenCalledWith(true);
  });

  it('hides one of my own notes once shared', () => {
    const onReveal = renderNote(note({revealed: true}));
    fireEvent.click(screen.getByRole('button', {name: 'Hide this note'}));
    expect(onReveal).toHaveBeenCalledWith(false);
  });

  it('offers nothing on somebody else\'s note, even to the facilitator', () => {
    renderNote(note({isMine: false, revealed: true}));
    expect(screen.queryByRole('button', {name: 'Share this note'})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Hide this note'})).toBeNull();
  });
});
