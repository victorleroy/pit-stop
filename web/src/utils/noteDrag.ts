const NOTE_ID = 'text/note-id';
// Only the types of a drag can be read before the drop, so the source column travels as one.
const COLUMN_PREFIX = 'text/x-note-column-';
// Somebody else's shared note can join a group, but only its author or the facilitator moves it.
const GROUP_ONLY = 'text/x-note-group-only';

type Transfer = Pick<DataTransfer, 'setData' | 'types'>;

export const startNoteDrag = (
  transfer: Transfer,
  noteId: string,
  columnId: string,
  groupOnly = false,
) => {
  transfer.setData(NOTE_ID, noteId);
  transfer.setData(`${COLUMN_PREFIX}${columnId.toLowerCase()}`, columnId);
  if (groupOnly) transfer.setData(GROUP_ONLY, '1');
};

export const isGroupOnlyDrag = (transfer: Pick<DataTransfer, 'types'>) =>
  Array.from(transfer.types).includes(GROUP_ONLY);

export const isDraggedFromOtherColumn = (transfer: Pick<DataTransfer, 'types'>, columnId: string) => {
  const source = Array.from(transfer.types).find((type) => type.startsWith(COLUMN_PREFIX));
  return source !== undefined && source !== `${COLUMN_PREFIX}${columnId.toLowerCase()}`;
};
