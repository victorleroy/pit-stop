import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@/ui';
import {useAutoFocus} from '@/hooks/useAutoFocus';
import {noteColours} from '@/theme/texture';
import {useState} from 'react';
import type {Column} from '@/api/types';
import {CardStack} from '@/components/CardStack';

export const BoardColumn = ({
  canDecide,
  canGroup,
  canEditColumn,
  canModerate,
  canRemove,
  canVote,
  canWrite,
  column,
  index,
  isBusy,
  isFacilitator,
  onAddNote,
  onGroupNote,
  onMoveNote,
  onRemoveColumn,
  onRemoveNote,
  onRenameCluster,
  onRenameColumn,
  onTurnIntoAction,
  onUngroupNote,
  onUpdateNote,
  onVote,
  ranks,
  showTotals,
  votesLeft,
}: {
  canDecide: boolean;
  canGroup: boolean;
  canEditColumn: boolean;
  canModerate: boolean;
  canRemove: boolean;
  canVote: boolean;
  canWrite: boolean;
  column: Column;
  index: number;
  isBusy: boolean;
  isFacilitator: boolean;
  onAddNote: (text: string) => void;
  onGroupNote: (noteId: string, targetId: string) => void;
  onMoveNote: (noteId: string) => void;
  onRemoveColumn: () => void;
  onRemoveNote: (noteId: string) => void;
  onRenameCluster: (clusterId: string, title: string) => void;
  onRenameColumn: (title: string) => void;
  onTurnIntoAction: (text: string) => void;
  onUngroupNote: (noteId: string) => void;
  onUpdateNote: (noteId: string, text: string) => void;
  onVote: (targetId: string, delta: 1 | -1) => void;
  ranks: Map<string, number>;
  showTotals: boolean;
  votesLeft: number;
}) => {
  const [draft, setDraft] = useState('');
  const [isOver, setIsOver] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);
  const titleRef = useAutoFocus(isRenaming);

  const submit = () => {
    const text = draft.trim();

    if (!text) return;

    setDraft('');
    onAddNote(text);
  };

  const saveTitle = () => {
    const title = titleDraft.trim();
    setIsRenaming(false);

    if (title && title !== column.title) {
      onRenameColumn(title);
    }
  };

  return (
    <Paper
      // Dropping on the column itself moves the note here; dropping on a card groups them.
      onDragLeave={() => setIsOver(false)}
      onDragOver={(event) => {
        if (!canWrite) return;
        event.preventDefault();
        setIsOver(true);
      }}
      onDrop={(event) => {
        setIsOver(false);
        if (!canWrite || event.defaultPrevented) return;
        const noteId = event.dataTransfer.getData('text/note-id');
        if (noteId) onMoveNote(noteId);
      }}
      elevation={0}
      sx={{
        bgcolor: isOver ? 'action.hover' : 'rgba(255, 255, 255, 0.92)',
        border: '1px solid',
        borderColor: isOver ? 'primary.main' : 'divider',
        borderRadius: 2,
        display: 'flex',
        // The columns share the width there is, up to a comfortable reading measure, and
        // never shrink below 320px: past that the board scrolls sideways rather than squeezing
        // notes into slivers or wrapping onto a second row. The width is the basis the board
        // measures its content by. On a phone one column still fits the screen, its buttons
        // included.
        flex: {sm: '1 0 320px', xs: '0 0 min(340px, calc(100vw - 48px))'},
        flexDirection: 'column',
        maxWidth: {sm: 460},
        p: 2.5,
        transition: 'background-color 120ms ease, border-color 120ms ease',
        width: {sm: 320, xs: 'min(340px, calc(100vw - 48px))'},
      }}
    >
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
          {isRenaming ? (
            <TextField
              fullWidth
              inputRef={titleRef}
              onBlur={saveTitle}
              onChange={(event) => setTitleDraft(event.target.value)}
              size="small"
              value={titleDraft}
            />
          ) : (
            <Stack direction="row" spacing={1} sx={{alignItems: 'center', flexGrow: 1, minWidth: 0}}>
              <Box
                sx={{
                  bgcolor: noteColours(index).paper,
                  borderRadius: 999,
                  flexShrink: 0,
                  height: 10,
                  width: 10,
                }}
              />
              {/* One line, so every column's first card starts at the same height. */}
              <Typography noWrap sx={{minWidth: 0}} title={column.title} variant="headingS">
                {column.title}
              </Typography>
              <Typography color="textSecondary" sx={{flexShrink: 0}} variant="textXs">
                {column.cards.length}
              </Typography>
            </Stack>
          )}

          {canEditColumn && !isRenaming ? (
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Rename the column">
                {/* A disabled button fires no events: the span keeps the tooltip working. */}
                <span>
                  <IconButton
                    aria-label="Rename column"
                    disabled={isBusy}
                    onClick={() => setIsRenaming(true)}
                    size="small"
                  >
                    <EditOutlinedIcon fontSize="inherit" />
                  </IconButton>
                </span>
              </Tooltip>
              {canRemove ? (
                <Tooltip title="Delete the column">
                  <span>
                    <IconButton
                      aria-label="Delete column"
                      disabled={isBusy}
                      onClick={onRemoveColumn}
                      size="small"
                    >
                      <CloseRoundedIcon fontSize="inherit" />
                    </IconButton>
                  </span>
                </Tooltip>
              ) : null}
            </Stack>
          ) : null}
        </Stack>

        {column.cards.map((card) => (
          <CardStack
            canDecide={canDecide}
            canGroup={canGroup}
            canModerate={canModerate}
            columnIndex={index}
            canVote={canVote}
            canWrite={canWrite}
            card={card}
            isBusy={isBusy}
            isFacilitator={isFacilitator}
            key={card.id}
            onDropNote={(noteId) => onGroupNote(noteId, card.id)}
            onRemoveNote={onRemoveNote}
            onRenameCluster={(title) => onRenameCluster(card.id, title)}
            onTurnIntoAction={onTurnIntoAction}
            onUngroupNote={onUngroupNote}
            onUpdateNote={onUpdateNote}
            onVote={(delta) => onVote(card.id, delta)}
            rank={ranks.get(card.id)}
            showTotals={showTotals}
            votesLeft={votesLeft}
          />
        ))}

        {canWrite ? (
          <Stack spacing={1}>
            <TextField
              fullWidth
              multiline
              onChange={(event) => setDraft(event.target.value)}
              sx={{
                '& .MuiInputBase-root': {
                  bgcolor: 'rgba(255, 255, 255, 0.6)',
                  borderRadius: '2px 2px 10px 2px',
                },
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Add a note…"
              size="small"
              value={draft}
            />
            <Button disabled={!draft.trim() || isBusy} onClick={submit} size="small">
              Add
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
};
