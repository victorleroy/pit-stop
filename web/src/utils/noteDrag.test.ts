import {describe, expect, it} from 'vitest';
import {isDraggedFromOtherColumn, isGroupOnlyDrag, startNoteDrag} from '@/utils/noteDrag';

const fakeTransfer = () => {
  const data = new Map<string, string>();
  return {
    data,
    setData: (type: string, value: string) => void data.set(type.toLowerCase(), value),
    get types() {
      return [...data.keys()];
    },
  };
};

describe('noteDrag', () => {
  it('carries the note id', () => {
    const transfer = fakeTransfer();
    startNoteDrag(transfer, 'note-1', 'col-A');
    expect(transfer.data.get('text/note-id')).toBe('note-1');
  });

  it('accepts a card of the same column', () => {
    const transfer = fakeTransfer();
    startNoteDrag(transfer, 'note-1', 'col-A');
    expect(isDraggedFromOtherColumn(transfer, 'col-A')).toBe(false);
  });

  it('refuses a card of another column', () => {
    const transfer = fakeTransfer();
    startNoteDrag(transfer, 'note-1', 'col-A');
    expect(isDraggedFromOtherColumn(transfer, 'col-B')).toBe(true);
  });

  it('does not refuse a drag that is not a note', () => {
    expect(isDraggedFromOtherColumn(fakeTransfer(), 'col-B')).toBe(false);
  });

  it("marks somebody else's note as groupable but not movable", () => {
    const theirs = fakeTransfer();
    startNoteDrag(theirs, 'note-1', 'col-A', true);
    expect(isGroupOnlyDrag(theirs)).toBe(true);

    const mine = fakeTransfer();
    startNoteDrag(mine, 'note-2', 'col-A');
    expect(isGroupOnlyDrag(mine)).toBe(false);
  });
});
