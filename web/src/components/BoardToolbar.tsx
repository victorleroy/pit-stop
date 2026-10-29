import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import {
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@/ui';
import {Fragment, useState} from 'react';
import {VOTE_OPTIONS} from '@/api/retros';
import type {Board, RetroPhase, TimerAction} from '@/api/types';
import {TimerControls} from '@/components/TimerBar';
import {useAutoFocus} from '@/hooks/useAutoFocus';
import {WASH_EDGE} from '@/theme/texture';

const PHASE_LABELS: Record<RetroPhase, string> = {
  ARCHIVED: 'Archived',
  BRAINSTORM: 'Brainstorm',
  DISCUSS: 'Discuss',
  SHARE: 'Share',
  VOTE: 'Vote',
};

const PHASE_HINTS: Record<RetroPhase, string> = {
  ARCHIVED: 'This retro is archived and read-only.',
  BRAINSTORM: 'Others see that you are writing, not what. Write freely.',
  DISCUSS: 'Going through the topics in vote order.',
  SHARE: 'Share your notes to make them readable. You can hide them again.',
  VOTE: 'Everyone spends their votes on the topics to discuss.',
};

const WORKING_PHASES: RetroPhase[] = ['BRAINSTORM', 'SHARE', 'VOTE', 'DISCUSS'];

// The budget is settled before anybody spends it: once voting starts it stays put.
const VOTE_SETTING_PHASES: RetroPhase[] = ['BRAINSTORM', 'SHARE'];

/**
 * One strip to drive the retro: where we are, how long is left, what happens next.
 * Everything the facilitator needs mid-session, on a single line whenever it fits.
 */
export const BoardToolbar = ({
  board,
  isAddingColumn,
  isBusy,
  isTimerBusy,
  onAddColumn,
  onAddingColumnChange,
  onHide,
  onMaxVotesChange,
  onPhaseChange,
  onReveal,
  onTakeFacilitation,
  onTimer,
  receivedAt,
}: {
  board: Board;
  /** Owned by the page, so an empty board can open the same dialog from its own button. */
  isAddingColumn: boolean;
  isBusy: boolean;
  /** Only the timer's own request holds its buttons: a note being saved should not. */
  isTimerBusy: boolean;
  onAddColumn: (title: string) => void;
  onAddingColumnChange: (isAdding: boolean) => void;
  onHide: () => void;
  onMaxVotesChange: (maxVotes: number) => void;
  onPhaseChange: (phase: RetroPhase) => void;
  onReveal: () => void;
  onTakeFacilitation: () => void;
  onTimer: (action: TimerAction, seconds?: number) => void;
  /** When this board reached the client: what the timer's `remainingMs` was true at. */
  receivedAt: number;
}) => {
  const [newColumn, setNewColumn] = useState('');
  const columnInputRef = useAutoFocus(isAddingColumn);

  const closeColumnDialog = () => {
    onAddingColumnChange(false);
    setNewColumn('');
  };

  const addColumn = () => {
    if (!newColumn.trim()) return;

    onAddColumn(newColumn.trim());
    closeColumnDialog();
  };

  const currentIndex = WORKING_PHASES.indexOf(board.phase);
  const nextPhase = WORKING_PHASES[currentIndex + 1];
  const isArchived = board.phase === 'ARCHIVED';
  const canReveal = ['SHARE', 'VOTE', 'DISCUSS'].includes(board.phase);
  const myNotes = board.columns.flatMap((column) =>
    column.cards.flatMap(({notes}) => notes.filter((note) => note.isMine)),
  );
  const hasHiddenNotes = myNotes.some(({revealed}) => !revealed);
  // The board's structure is settled while people write, and by the facilitator alone.
  const canAddColumn = board.isFacilitator && board.phase === 'BRAINSTORM';
  const hasColumns = board.columns.length > 0;
  const isSettingVotes = VOTE_SETTING_PHASES.includes(board.phase);
  const votesLeftLabel = `${board.myVotesLeft} vote${board.myVotesLeft === 1 ? '' : 's'} left`;

  /**
   * The right-hand side reads as a few small groups rather than one long row of buttons:
   * the clock, what you do with your own notes, and what the facilitator does with the
   * retro. A group with nothing in it disappears along with its divider.
   */
  const timerBlock =
    !isArchived && (board.isFacilitator || board.timer.state !== 'IDLE') ? (
      <TimerControls
        isBusy={isTimerBusy}
        isFacilitator={board.isFacilitator}
        onTimer={onTimer}
        receivedAt={receivedAt}
        timer={board.timer}
      />
    ) : null;

  const myBlock =
    board.phase === 'VOTE' || (canReveal && (hasHiddenNotes || board.myNotesRevealed)) ? (
      <>
        {board.phase === 'VOTE' ? (
          <Chip
            color={board.myVotesLeft === 0 ? 'default' : 'primary'}
            label={votesLeftLabel}
            size="small"
            sx={{fontVariantNumeric: 'tabular-nums'}}
            variant="outlined"
          />
        ) : null}

        {canReveal && hasHiddenNotes ? (
          <Button
            disabled={isBusy}
            onClick={onReveal}
            size="small"
            startIcon={<VisibilityOutlinedIcon />}
            variant="outlined"
          >
            Share my notes
          </Button>
        ) : null}

        {canReveal && board.myNotesRevealed ? (
          <Button
            disabled={isBusy}
            onClick={onHide}
            size="small"
            startIcon={<VisibilityOffOutlinedIcon />}
            variant="text"
          >
            Hide my notes
          </Button>
        ) : null}
      </>
    ) : null;

  const moveOnButton = (
    <Button
      disabled={isBusy || !hasColumns}
      onClick={() => nextPhase && onPhaseChange(nextPhase)}
      variant="contained"
    >
      Move on to {nextPhase ? PHASE_LABELS[nextPhase] : ''}
    </Button>
  );

  const facilitatorBlock = isArchived ? (
    board.isFacilitator ? (
      <Button disabled={isBusy} onClick={() => onPhaseChange('DISCUSS')} variant="contained">
        Reopen retro
      </Button>
    ) : null
  ) : board.isFacilitator ? (
    <>
      {canAddColumn ? (
        <Button
          disabled={isBusy}
          onClick={() => onAddingColumnChange(true)}
          size="small"
          variant="outlined"
        >
          Add a column
        </Button>
      ) : null}

      {isSettingVotes ? (
        <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
          <Typography color="textSecondary" id="max-votes-label" variant="textXs">
            Votes per person
          </Typography>
          <Select
            disabled={isBusy}
            labelId="max-votes-label"
            onChange={(event) => onMaxVotesChange(Number(event.target.value))}
            size="small"
            sx={{'& .MuiSelect-select': {py: 0.5}, fontVariantNumeric: 'tabular-nums', minWidth: 64}}
            value={board.maxVotes}
          >
            {VOTE_OPTIONS.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </Stack>
      ) : null}

      {nextPhase ? (
        hasColumns ? (
          moveOnButton
        ) : (
          // A disabled button swallows the hover, so the tooltip listens on a wrapper.
          <Tooltip title="Add at least one column first">
            <span>{moveOnButton}</span>
          </Tooltip>
        )
      ) : null}

      {board.phase === 'DISCUSS' ? (
        // The last step forward, so it carries the same weight as the moves before it.
        <Button disabled={isBusy} onClick={() => onPhaseChange('ARCHIVED')} variant="contained">
          Done
        </Button>
      ) : null}
    </>
  ) : (
    <>
      {isSettingVotes ? (
        <Typography color="textSecondary" sx={{whiteSpace: 'nowrap'}} variant="textXs">
          {board.maxVotes} vote{board.maxVotes === 1 ? '' : 's'} each
        </Typography>
      ) : null}
      <Button disabled={isBusy} onClick={onTakeFacilitation} size="small" variant="text">
        Take over facilitation
      </Button>
    </>
  );

  const blocks = [timerBlock, myBlock, facilitatorBlock].filter(Boolean);

  return (
    <Card elevation={0} sx={{overflow: 'hidden'}}>
      {/* The wash, wound tight: the only place a gradient touches the interface. */}
      <Box sx={{...WASH_EDGE, height: 3}} />
      <Stack spacing={1.5} sx={{px: 2.5, py: 2}}>
        <Stack
          direction="row"
          spacing={2}
          // Spread rather than pushed right: when the controls do not fit beside the track
          // they start their own line from the left, under it, instead of floating right.
          sx={{alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 1.5}}
          useFlexGap
        >
          {/*
            * The phase is the spine of the session, so it reads as a track rather than as
            * four chips: laps behind you in indigo, the one you are on larger and warm, the
            * rest hollow. It is the only thing on screen that says how far along you are.
            */}
          {/* Capped, so on a wide screen the rails stay the length of a step, not of a room. */}
          <Stack
            direction="row"
            sx={{alignItems: 'flex-start', flexGrow: 1, maxWidth: 640, minWidth: {xs: 0, sm: 420}}}
          >
            {WORKING_PHASES.map((phase, index) => {
              const isDone = index < currentIndex;
              const isCurrent = phase === board.phase;
              const canJump = board.isFacilitator && !isArchived && !isCurrent;

              return (
                <Stack direction="row" key={phase} sx={{alignItems: 'flex-start', flexGrow: index ? 1 : 0}}>
                  {index ? (
                    <Box
                      sx={{
                        backgroundImage: index <= currentIndex ? WASH_EDGE.backgroundImage : 'none',
                        bgcolor: index <= currentIndex ? undefined : 'divider',
                        flexGrow: 1,
                        height: 2,
                        // Centre of the fixed 20px dot lane, so the rail never moves.
                        mt: '9px',
                        mx: 0.5,
                      }}
                    />
                  ) : null}

                  <Stack
                    component={canJump ? 'button' : 'div'}
                    onClick={canJump ? () => onPhaseChange(phase) : undefined}
                    spacing={0.75}
                    sx={{
                      alignItems: 'center',
                      background: 'none',
                      border: 0,
                      cursor: canJump ? 'pointer' : 'default',
                      font: 'inherit',
                      p: 0,
                      width: {xs: 64, sm: 92},
                    }}
                  >
                    {/*
                      * The dot grows when it becomes current, so it lives in a lane of fixed
                      * height: it swells in place instead of shoving the label and the rail
                      * down every time somebody changes phase.
                      */}
                    <Box
                      sx={{
                        alignItems: 'center',
                        display: 'flex',
                        height: 20,
                        justifyContent: 'center',
                        width: 20,
                      }}
                    >
                      <Box
                        sx={{
                          bgcolor: isCurrent
                            ? '#FF5C9D'
                            : isDone
                              ? 'primary.main'
                              : 'background.paper',
                          border: isCurrent || isDone ? 0 : '2px solid',
                          borderColor: 'divider',
                          borderRadius: 999,
                          boxShadow: isCurrent ? '0 0 0 5px rgba(255, 92, 157, 0.18)' : 'none',
                          boxSizing: 'border-box',
                          height: isCurrent ? 18 : 12,
                          transition: 'height 140ms ease, width 140ms ease, background-color 140ms ease',
                          width: isCurrent ? 18 : 12,
                        }}
                      />
                    </Box>
                    <Typography
                      sx={{
                        color: isCurrent ? 'text.primary' : 'text.secondary',
                        // Bolding widens the word; reserving the bold width keeps it still.
                        fontVariationSettings: isCurrent ? '"wght" 700' : '"wght" 500',
                        fontWeight: isCurrent ? 700 : 500,
                        textAlign: 'center',
                        width: '100%',
                      }}
                      variant="textXs"
                    >
                      {PHASE_LABELS[phase]}
                    </Typography>
                  </Stack>
                </Stack>
              );
            })}

            {isArchived ? (
              <Chip color="primary" label={PHASE_LABELS.ARCHIVED} size="small" sx={{ml: 1}} />
            ) : null}
          </Stack>

          <Stack
            direction="row"
            sx={{
              alignItems: 'center',
              columnGap: 2,
              flexWrap: 'wrap',
              rowGap: 1.5,
            }}
          >
            {blocks.map((block, index) => (
              <Fragment key={index}>
                {/* On a phone the blocks stack, and a rule left alone at the end of a line reads as a glitch. */}
                {index ? (
                  <Divider
                    flexItem
                    orientation="vertical"
                    sx={{display: {xs: 'none', sm: 'block'}, my: 0.5}}
                  />
                ) : null}
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{alignItems: 'center', flexWrap: 'wrap', rowGap: 1}}
                  useFlexGap
                >
                  {block}
                </Stack>
              </Fragment>
            ))}
          </Stack>
        </Stack>

        <Dialog onClose={closeColumnDialog} open={isAddingColumn} size="small">
          <DialogTitle>Add a column</DialogTitle>
          <DialogContent>
            <Stack spacing={1.5} sx={{pt: 1}}>
              <TextField
                fullWidth
                inputRef={columnInputRef}
                label="Column name"
                onChange={(event) => setNewColumn(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;

                  // Closing the dialog hands focus back to the button that opened it, and
                  // the rest of the key press would open it again.
                  event.preventDefault();
                  addColumn();
                }}
                placeholder="Kudos"
                size="small"
                value={newColumn}
              />
              <Typography color="textSecondary" variant="textXs">
                Columns can only be added or removed while people write.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeColumnDialog} variant="text">
              Cancel
            </Button>
            <Button
              disabled={!newColumn.trim() || isBusy}
              onClick={addColumn}
              variant="contained"
            >
              Add
            </Button>
          </DialogActions>
        </Dialog>

        <Typography color="textSecondary" variant="textXs">
          {PHASE_HINTS[board.phase]}
          {board.isFacilitator && !isArchived ? ' Click a step to go back to it.' : ''}
        </Typography>
      </Stack>
    </Card>
  );
};
