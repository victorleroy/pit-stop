const NOTE_ID = 'text/note-id';
// Only the types of a drag can be read before the drop, so the source column travels as one.
const COLUMN_PREFIX = 'text/x-note-column-';

type Transfer = Pick<DataTransfer, 'setData' | 'types'>;

export const startNoteDrag = (transfer: Transfer, noteId: string, columnId: string) => {
  transfer.setData(NOTE_ID, noteId);
  transfer.setData(`${COLUMN_PREFIX}${columnId.toLowerCase()}`, columnId);
};

export const isDraggedFromOtherColumn = (transfer: Pick<DataTransfer, 'types'>, columnId: string) => {
  const source = Array.from(transfer.types).find((type) => type.startsWith(COLUMN_PREFIX));
  return source !== undefined && source !== `${COLUMN_PREFIX}${columnId.toLowerCase()}`;
};
