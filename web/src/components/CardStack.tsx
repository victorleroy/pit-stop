import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import {
  Card as CardSurface,
  Chip,
  IconButton,
  Stack,
  Tag,
  TextField,
  Tooltip,
  Typography,
} from '@/ui';
import {useState} from 'react';
import type {Card} from '@/api/types';
import {NoteCard} from '@/components/NoteCard';
import {useAutoFocus} from '@/hooks/useAutoFocus';

/**
 * A card is either a single note or a stack of grouped notes. It is also the unit people
 * vote on, and the drop target when grouping.
 */
export const CardStack = ({
  canGroup,
  canModerate,
  canVote,
  canWrite,
  card,
  columnIndex,
  isBusy,
  isFacilitator,
  onDropNote,
  onRemoveNote,
  onRenameCluster,
  onUngroupNote,
  onUpdateNote,
  onVote,
  rank,
  showTotals,
  votesLeft,
}: {
  canGroup: boolean;
  canModerate: boolean;
  canVote: boolean;
  canWrite: boolean;
  card: Card;
  columnIndex: number;
  isBusy: boolean;
  isFacilitator: boolean;
  onDropNote: (noteId: string) => void;
  onRemoveNote: (noteId: string) => void;
  onRenameCluster: (title: string) => void;
  onUngroupNote: (noteId: string) => void;
  onUpdateNote: (noteId: string, text: string) => void;
  onVote: (delta: 1 | -1) => void;
  /** 1, 2 or 3 for the most voted cards of the whole board, undefined otherwise. */
  rank?: number;
  showTotals: boolean;
  votesLeft: number;
}) => {
  const [isOver, setIsOver] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title ?? '');
  const titleRef = useAutoFocus(isRenaming);

  const isCluster = card.type === 'cluster';

  const saveTitle = () => {
    const title = titleDraft.trim();
    setIsRenaming(false);

    if (title && title !== card.title) {
      onRenameCluster(title);
    }
  };

  return (
    <CardSurface
      elevation={0}
      onDragLeave={() => setIsOver(false)}
      onDragOver={(event) => {
        if (!canGroup) return;
        event.preventDefault();
        setIsOver(true);
      }}
      onDrop={(event) => {
        setIsOver(false);
        if (!canGroup) return;
        const noteId = event.dataTransfer.getData('text/note-id');
        if (noteId && noteId !== card.id) {
          // Claim the drop so the column underneath does not also move the note.
          event.preventDefault();
          onDropNote(noteId);
        }
      }}
      sx={{
        bgcolor: isCluster ? 'rgba(15, 23, 42, 0.03)' : 'transparent',
        borderColor: isOver ? 'primary.main' : isCluster ? 'divider' : 'transparent',
        // Square, like the notes it holds.
        borderRadius: 0,
        borderStyle: isCluster ? 'solid' : 'dashed',
        borderWidth: isOver ? 2 : 1,
        // The vote badge straddles the corner, and Paper clips its overflow by default.
        overflow: 'visible',
        // The three most voted cards are the ones the team will actually talk about.
        outline: rank ? '2px solid' : 'none',
        outlineColor: 'primary.main',
        outlineOffset: 3,
        p: isCluster ? 1.5 : 0,
        position: 'relative',
        transition: 'border-color 120ms ease',
      }}
    >
      {showTotals ? (
        <Tooltip
          title={
            rank
              ? `${card.totalVotes ?? 0} votes, ${rank} of the top three`
              : `${card.totalVotes ?? 0} vote${(card.totalVotes ?? 0) > 1 ? 's' : ''}`
          }
        >
          <Stack sx={{position: 'absolute', right: -10, top: -10, zIndex: 2}}>
            <Tag color={rank ? 'primary' : 'muted'} size="medium">
              {`${card.totalVotes ?? 0}`}
            </Tag>
          </Stack>
        </Tooltip>
      ) : null}

      <Stack spacing={1}>
        {isCluster ? (
          <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
            {isRenaming ? (
              <TextField
                fullWidth
                inputRef={titleRef}
                onBlur={saveTitle}
                onChange={(event) => setTitleDraft(event.target.value)}
                placeholder="Name the group"
                size="small"
                value={titleDraft}
              />
            ) : (
              <Typography sx={{flexGrow: 1}} variant="textM">
                {card.title ?? `Group of ${card.notes.length}`}
              </Typography>
            )}
            {canGroup && !isRenaming ? (
              <IconButton
                aria-label="Name the group"
                disabled={isBusy}
                onClick={() => setIsRenaming(true)}
                size="small"
              >
                <EditOutlinedIcon fontSize="inherit" />
              </IconButton>
            ) : null}
          </Stack>
        ) : null}

        {card.notes.map((note) => (
          <NoteCard
            canDrag={canModerate}
            canEdit={canWrite}
            canGroup={canGroup}
            canRemove={canModerate}
            columnIndex={columnIndex}
            isBusy={isBusy}
            isClustered={isCluster}
            isFacilitator={isFacilitator}
            key={note.id}
            note={note}
            onRemove={() => onRemoveNote(note.id)}
            onUngroup={() => onUngroupNote(note.id)}
            onUpdate={(text) => onUpdateNote(note.id, text)}
          />
        ))}

        {canVote ? (
          <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
            <IconButton
              aria-label="Remove a vote"
              disabled={isBusy || card.myVotes === 0}
              onClick={() => onVote(-1)}
              size="small"
            >
              <RemoveRoundedIcon fontSize="inherit" />
            </IconButton>
            <Chip label={`${card.myVotes}`} size="small" />
            <IconButton
              aria-label="Add a vote"
              disabled={isBusy || votesLeft === 0}
              onClick={() => onVote(1)}
              size="small"
            >
              <AddRoundedIcon fontSize="inherit" />
            </IconButton>
          </Stack>
        ) : null}
      </Stack>
    </CardSurface>
  );
};
