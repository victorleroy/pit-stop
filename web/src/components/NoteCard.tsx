import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import NorthEastRoundedIcon from '@mui/icons-material/NorthEastRounded';
import {Box, IconButton, Stack, TextField, Typography} from '@/ui';
import {useState} from 'react';
import type {Note} from '@/api/types';
import {useAutoFocus} from '@/hooks/useAutoFocus';
import {SLIPSTREAM} from '@/ui/theme';
import {PAPER_SHADOW, PAPER_SHADOW_RAISED, noteColours} from '@/theme/texture';

export const NoteCard = ({
  canDrag,
  canEdit,
  canGroup,
  canRemove,
  columnIndex,
  isBusy,
  isClustered,
  isFacilitator,
  note,
  onRemove,
  onUngroup,
  onUpdate,
}: {
  canDrag: boolean;
  canEdit: boolean;
  canGroup: boolean;
  canRemove: boolean;
  columnIndex: number;
  isBusy: boolean;
  isClustered: boolean;
  isFacilitator: boolean;
  note: Note;
  onRemove: () => void;
  onUngroup: () => void;
  onUpdate: (text: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const draftRef = useAutoFocus(isEditing);

  const {ink, paper} = noteColours(columnIndex);
  const canHandle = canDrag && (note.isMine || isFacilitator);
  // The service sends no text until its author shares it: there is nothing to read here yet.
  const isWithheld = !note.revealed && !note.isMine;
  // Yours, written but not yet handed to the room. The one thing you still owe the team.
  const isPending = note.isMine && !note.revealed;
  // The facilitator moderates the board on top of their own notes.
  const mine = note.isMine || isFacilitator;

  const save = () => {
    const text = draft.trim();
    setIsEditing(false);

    if (text && text !== note.text) {
      onUpdate(text);
    }
  };

  return (
    <Box
      draggable={canHandle && !isEditing}
      onDragStart={(event) => event.dataTransfer.setData('text/note-id', note.id)}
      sx={{
        '&:hover': canHandle
          ? {boxShadow: PAPER_SHADOW_RAISED, transform: 'translateY(-2px)'}
          : undefined,
        // A withheld note is face down: no paper colour, nothing to read, a closed padlock.
        // Anonymity is the product's whole promise, so it has to be a state you can see
        // across the room rather than a line of grey small print.
        backgroundColor: isWithheld ? SLIPSTREAM.surface : paper,
        backgroundImage: isWithheld
          ? 'none'
          : 'linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 38%)',
        border: isWithheld ? '1px dashed #CFD7E3' : 0,
        // Your own unshared note keeps its paper and gains an indigo edge.
        borderLeft: isPending ? `3px solid ${SLIPSTREAM.indigo}` : undefined,
        borderRadius: '10px',
        boxShadow: isWithheld ? 'none' : PAPER_SHADOW,
        color: isWithheld ? SLIPSTREAM.inkMuted : ink,
        cursor: canHandle && !isEditing ? 'grab' : 'default',
        p: 2,
        transition: 'transform 140ms ease, box-shadow 140ms ease',
      }}
    >
      <Stack spacing={1}>
        {isEditing ? (
          <TextField
            fullWidth
            inputRef={draftRef}
            multiline
            onBlur={save}
            onChange={(event) => setDraft(event.target.value)}
            size="small"
            sx={{'& .MuiInputBase-root': {bgcolor: 'rgba(255, 255, 255, 0.7)'}}}
            value={draft}
          />
        ) : isWithheld ? (
          <Stack aria-label="Not shared yet" spacing={0.75} sx={{py: 0.5}}>
            <Box
              sx={{
                background:
                  'repeating-linear-gradient(45deg, #E9EEF5 0 6px, #F4F7FB 6px 12px)',
                borderRadius: 999,
                height: 8,
                width: '88%',
              }}
            />
            <Box
              sx={{
                background:
                  'repeating-linear-gradient(45deg, #E9EEF5 0 6px, #F4F7FB 6px 12px)',
                borderRadius: 999,
                height: 8,
                width: '60%',
              }}
            />
          </Stack>
        ) : (
          <Typography sx={{color: 'inherit', whiteSpace: 'pre-wrap'}} variant="textM">
            {note.text}
          </Typography>
        )}

        <Stack direction="row" spacing={1} sx={{alignItems: 'center', minHeight: 24}}>
          <Typography sx={{color: 'inherit', flexGrow: 1, opacity: 0.65}} variant="textXs">
            {note.isMine ? `${note.author.name} (you)` : `${note.author.name} wrote this`}
          </Typography>

          {isWithheld ? (
            <Stack direction="row" spacing={0.5} sx={{alignItems: 'center', opacity: 0.75}}>
              <LockOutlinedIcon sx={{fontSize: 13}} />
              <Typography sx={{color: 'inherit'}} variant="textXs">
                not shared yet
              </Typography>
            </Stack>
          ) : null}

          {isPending ? (
            <Typography sx={{color: SLIPSTREAM.indigo, fontWeight: 700}} variant="textXs">
              only you
            </Typography>
          ) : null}

          <Stack direction="row" spacing={0.5}>
            {isClustered && canGroup ? (
              <IconButton
                aria-label="Take out of the group"
                disabled={isBusy}
                onClick={onUngroup}
                size="small"
                sx={{color: 'inherit', opacity: 0.6}}
              >
                <NorthEastRoundedIcon fontSize="inherit" />
              </IconButton>
            ) : null}

            {/* Editing a text nobody sent us would overwrite it with nothing. */}
            {canEdit && mine && !isEditing && !isWithheld ? (
              <IconButton
                aria-label="Edit"
                disabled={isBusy}
                onClick={() => setIsEditing(true)}
                size="small"
                sx={{color: 'inherit', opacity: 0.6}}
              >
                <EditOutlinedIcon fontSize="inherit" />
              </IconButton>
            ) : null}

            {canRemove && mine && !isEditing ? (
              <IconButton
                aria-label="Delete"
                disabled={isBusy}
                onClick={onRemove}
                size="small"
                sx={{color: 'inherit', opacity: 0.6}}
              >
                <CloseRoundedIcon fontSize="inherit" />
              </IconButton>
            ) : null}
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
};
