import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AddTaskOutlinedIcon from '@mui/icons-material/AddTaskOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import {
  Box,
  Card as CardSurface,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@/ui';
import {useState} from 'react';
import type {Card} from '@/api/types';
import {NoteCard} from '@/components/NoteCard';
import {useAutoFocus} from '@/hooks/useAutoFocus';
import {SLIPSTREAM} from '@/ui/theme';

const COUNT_TONES = {
  muted: {
    bgcolor: `${SLIPSTREAM.inkMuted}22`,
    border: `1px solid ${SLIPSTREAM.inkMuted}55`,
    color: 'text.primary',
  },
  neutral: {bgcolor: 'action.selected', color: 'text.primary'},
  rank: {bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700},
} as const;

/**
 * A vote count is a number in a coin: perfectly round while it holds one digit, stretching
 * into a pill only when it needs the room. A chip pads its label and turns one digit into
 * an egg.
 */
const VoteCount = ({
  count,
  size,
  tone,
}: {
  count: number;
  size: 'medium' | 'small';
  tone: keyof typeof COUNT_TONES;
}) => {
  const box = size === 'small' ? 24 : 28;

  return (
    <Box
      sx={{
        alignItems: 'center',
        borderRadius: 999,
        boxSizing: 'border-box',
        display: 'inline-flex',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 600,
        height: box,
        justifyContent: 'center',
        lineHeight: 1,
        minWidth: box,
        px: count >= 10 ? 0.75 : 0,
        typography: size === 'small' ? 'textXs' : 'textS',
        ...COUNT_TONES[tone],
      }}
    >
      {count}
    </Box>
  );
};

/**
 * A card is either a single note or a stack of grouped notes. It is also the unit people
 * vote on, and the drop target when grouping.
 */
export const CardStack = ({
  canDecide = false,
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
  onTurnIntoAction,
  onUngroupNote,
  onUpdateNote,
  onVote,
  rank,
  showTotals,
  votesLeft,
}: {
  canDecide?: boolean;
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
  onTurnIntoAction?: (text: string) => void;
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
  // A note still face down has no text to hand over: only a card everyone can read becomes
  // an action. Its author does see their own withheld text, which must not leak into one.
  const isReadable =
    card.notes.length > 0 && card.notes.every(({revealed, text}) => revealed && text.trim());
  const actionText = isCluster
    ? card.title?.trim() || card.notes.map(({text}) => text.trim()).join(' / ')
    : (card.notes[0]?.text.trim() ?? '');

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
            {/* The three most voted cards are the ones the team will actually talk about. */}
            <VoteCount count={card.totalVotes ?? 0} size="medium" tone={rank ? 'rank' : 'muted'} />
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
            <VoteCount count={card.myVotes} size="small" tone="neutral" />
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

        {canDecide && onTurnIntoAction && isReadable ? (
          // Tucked in the corner, where the note's own edit and delete buttons sit while people
          // write: those are gone by the discussion, so the card keeps its height.
          <Stack sx={{bottom: 8, position: 'absolute', right: 8, zIndex: 2}}>
            {/* It only fills the action form: the team still words it and picks an owner. */}
            <Tooltip title="Turn into an action">
              <IconButton
                aria-label="Turn into an action"
                onClick={() => onTurnIntoAction(actionText)}
                size="small"
              >
                <AddTaskOutlinedIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          </Stack>
        ) : null}
      </Stack>
    </CardSurface>
  );
};
