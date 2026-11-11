import {describe, expect, it} from 'vitest';
import type {Board, Note} from '@/api/types';
import {boardAuthors, isFilteredOut} from '@/utils/authorFilter';

const note = (id: string, authorId: string, name: string) =>
  ({author: {id: authorId, name}, columnId: 'c', id, isMine: false, revealed: false, text: ''}) as Note;

describe('boardAuthors', () => {
  it('lists every author once, by name, shared notes or not', () => {
    const board = {
      columns: [
        {cards: [{id: 'k', myVotes: 0, notes: [note('1', 'z', 'Zoé'), note('2', 'a', 'Alex')], type: 'cluster'}], id: 'c', order: 0, title: 'C'},
        {cards: [{id: 'n', myVotes: 0, notes: [note('3', 'z', 'Zoé')], type: 'note'}], id: 'd', order: 1, title: 'D'},
      ],
    } as Pick<Board, 'columns'>;

    expect(boardAuthors(board).map(({id}) => id)).toEqual(['a', 'z']);
  });
});

describe('isFilteredOut', () => {
  it('keeps everybody while nobody is selected', () => {
    expect(isFilteredOut('a', [])).toBe(false);
  });

  it('keeps only the selected authors', () => {
    expect(isFilteredOut('a', ['a', 'b'])).toBe(false);
    expect(isFilteredOut('c', ['a', 'b'])).toBe(true);
  });
});
