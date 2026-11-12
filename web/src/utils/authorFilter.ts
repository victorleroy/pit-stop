import type {Board, NoteAuthor} from '@/api/types';

/** The people who wrote on the board, as the projection already names them on every card. */
export const boardAuthors = (board: Pick<Board, 'columns'>): NoteAuthor[] => {
  const authors = new Map<string, NoteAuthor>();

  for (const column of board.columns) {
    for (const card of column.cards) {
      for (const {author} of card.notes) authors.set(author.id, author);
    }
  }

  return [...authors.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const isFilteredOut = (authorId: string, selectedIds: string[]) =>
  selectedIds.length > 0 && !selectedIds.includes(authorId);
