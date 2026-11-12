import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import NorthEastRoundedIcon from '@mui/icons-material/NorthEastRounded';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {Box, IconButton, Stack, Tooltip, Typography} from '@/ui';
import {useState} from 'react';
import type {Note} from '@/api/types';
import {InlineEditor} from '@/components/InlineEditor';
import {UserAvatar} from '@/components/UserAvatar';
import {SLIPSTREAM} from '@/ui/theme';
import {PAPER_SHADOW_RAISED, noteSurfaceSx, withheldLineSx} from '@/theme/texture';
import {startNoteDrag} from '@/utils/noteDrag';

export const NoteCard = ({
  canDrag,
  canEdit,
  canGroup,
  canRemove,
  canReveal,
  columnIndex,
  isBusy,
  isClustered,
  isDimmed = false,
  isFacilitator,
  note,
  onRemove,
  onReveal,
  onUngroup,
  onUpdate,
}: {
  canDrag: boolean;
  canEdit: boolean;
  canGroup: boolean;
  canRemove: boolean;
  canReveal: boolean;
  columnIndex: number;
  isBusy: boolean;
  isClustered: boolean;
  isDimmed?: boolean;
  isFacilitator: boolean;
  note: Note;
  onRemove: () => void;
  onReveal: (revealed: boolean) => void;
  onUngroup: () => void;
  onUpdate: (text: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);

  const canMove = note.isMine || isFacilitator;
  // Anyone can carry a shared note onto another card to group them, without owning it.
  const canHandle = canDrag && (canMove || (canGroup && note.revealed));
  // The service sends no text until its author shares it: there is nothing to read here yet.
  const isWithheld = !note.revealed && !note.isMine;
  // Yours, written but not yet handed to the room. The one thing you still owe the team.
  const isPending = note.isMine && !note.revealed;
  // The facilitator moderates the board on top of their own notes.
  const mine = note.isMine || isFacilitator;

  return (
    <Box
      draggable={canHandle && !isEditing}
      onDragStart={(event) => startNoteDrag(event.dataTransfer, note.id, note.columnId, !canMove)}
      sx={{
        '&:hover': canHandle
          ? {boxShadow: PAPER_SHADOW_RAISED, transform: 'translateY(-2px)'}
          : undefined,
        ...noteSurfaceSx(columnIndex, {isMine: note.isMine, isWithheld}),
        cursor: canHandle && !isEditing ? 'grab' : 'default',
        opacity: isDimmed ? 0.3 : 1,
        p: 1.25,
        transition: 'transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease',
      }}
    >
      <Stack spacing={0.75}>
        {isEditing ? (
          <InlineEditor
            multiline
            onClose={() => setIsEditing(false)}
            onSave={onUpdate}
            sx={{'& .MuiInputBase-root': {bgcolor: 'rgba(255, 255, 255, 0.7)'}}}
            value={note.text}
          />
        ) : isWithheld ? (
          <Stack aria-label="Not shared yet" spacing={0.75} sx={{py: 0.5}}>
            <Box sx={withheldLineSx('88%')} />
            <Box sx={withheldLineSx('60%')} />
          </Stack>
        ) : (
          <Typography
            sx={{
              color: 'inherit',
              fontSize: '0.875rem',
              lineHeight: 1.4,
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
            }}
            variant="textM"
          >
            {note.text}
          </Typography>
        )}

        <Stack direction="row" spacing={1} sx={{alignItems: 'center', minHeight: 20}}>
          <UserAvatar
            {...note.author}
            decorative
            size="small"
            sx={{flexShrink: 0, fontSize: 10, fontWeight: 700, height: 20, width: 20}}
          />
          {/* In a narrow column the name gives way, never the state beside it. */}
          <Typography
            noWrap
            sx={{
              color: note.isMine ? SLIPSTREAM.indigo : 'inherit',
              flexGrow: 1,
              fontWeight: note.isMine ? 700 : undefined,
              minWidth: 0,
              opacity: note.isMine ? 1 : 0.65,
            }}
            title={note.author.name}
            variant="textXs"
          >
            {note.isMine ? `${note.author.name} (you)` : note.author.name}
          </Typography>

          {isWithheld ? (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{alignItems: 'center', flexShrink: 0, opacity: 0.75, whiteSpace: 'nowrap'}}
            >
              <LockOutlinedIcon sx={{fontSize: 13}} />
              <Typography sx={{color: 'inherit'}} variant="textXs">
                not shared yet
              </Typography>
            </Stack>
          ) : null}

          {isPending ? (
            <Typography
              sx={{color: SLIPSTREAM.indigo, flexShrink: 0, fontWeight: 700, whiteSpace: 'nowrap'}}
              variant="textXs"
            >
              only you
            </Typography>
          ) : null}

          <Stack direction="row" spacing={0.5} sx={{flexShrink: 0}}>
            {isClustered && canGroup && (mine || note.revealed) ? (
              // The arrow says little on its own: the tooltip names the move.
              <Tooltip title="Take out of the group">
                <span>
                  <IconButton
                    aria-label="Take out of the group"
                    disabled={isBusy}
                    onClick={onUngroup}
                    size="small"
                    sx={{color: 'inherit', opacity: 0.6}}
                  >
                    <NorthEastRoundedIcon fontSize="inherit" />
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}

            {canReveal && note.isMine && !isEditing ? (
              <Tooltip title={note.revealed ? 'Hide this note' : 'Share this note'}>
                <span>
                  <IconButton
                    aria-label={note.revealed ? 'Hide this note' : 'Share this note'}
                    disabled={isBusy}
                    onClick={() => onReveal(!note.revealed)}
                    size="small"
                    sx={{color: 'inherit', opacity: 0.6}}
                  >
                    {note.revealed ? (
                      <VisibilityOffOutlinedIcon fontSize="inherit" />
                    ) : (
                      <VisibilityOutlinedIcon fontSize="inherit" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}

            {/* Editing a text nobody sent us would overwrite it with nothing. */}
            {canEdit && mine && !isEditing && !isWithheld ? (
              <IconButton
                aria-label="Edit the note"
                disabled={isBusy}
                onClick={() => setIsEditing(true)}
                size="small"
                sx={{color: 'inherit', opacity: 0.6}}
              >
                <EditOutlinedIcon fontSize="inherit" />
              </IconButton>
            ) : null}

            {canRemove && mine && !isEditing ? (
              <Tooltip title="Permanently delete this note">
                <span>
                  <IconButton
                    aria-label="Delete the note"
                    disabled={isBusy}
                    onClick={onRemove}
                    size="small"
                    sx={{color: 'inherit', opacity: 0.6}}
                  >
                    <CloseRoundedIcon fontSize="inherit" />
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
};
