import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
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
import {useQuery} from '@tanstack/react-query';
import {Fragment, useState} from 'react';
import type {ReactNode} from 'react';
import {fetchTeams} from '@/api/teams';
import {VOTE_OPTIONS} from '@/api/retros';
import type {Board, RetroPhase, TimerAction} from '@/api/types';
import {SaveAsTemplateDialog} from '@/components/SaveAsTemplateDialog';
import {TimerControls} from '@/components/TimerBar';
import {useAutoFocus} from '@/hooks/useAutoFocus';
import {COLUMN_EDIT_PHASES, hasReviewStep, nextOpeningPhase} from '@/utils/phases';
import {boardAuthors} from '@/utils/authorFilter';
import {WASH_EDGE} from '@/theme/texture';

export const PHASE_LABELS: Record<RetroPhase, string> = {
  ARCHIVED: 'Archived',
  BRAINSTORM: 'Brainstorm',
  DISCUSS: 'Discuss',
  ICEBREAKER: 'Icebreaker',
  LOBBY: 'Waiting room',
  REVIEW: 'Review',
  SHARE: 'Share',
  VOTE: 'Vote',
};

const WORKING_PHASES: RetroPhase[] = ['BRAINSTORM', 'SHARE', 'VOTE', 'DISCUSS'];

// A quick question answers in a couple of minutes, not the five of a brainstorm.
const ICEBREAKER_TIMER_SECONDS = 120;

// The budget is settled before anybody spends it: once voting starts it stays put.
const VOTE_SETTING_PHASES: RetroPhase[] = ['LOBBY', 'BRAINSTORM', 'SHARE'];

/**
 * One strip to drive the retro: where we are, how long is left, what happens next.
 * Everything the facilitator needs mid-session, on a single line whenever it fits.
 */
export const BoardToolbar = ({
  authorFilter,
  board,
  dice,
  isAddingColumn,
  isBusy,
  isTimerBusy,
  onAddColumn,
  onAddingColumnChange,
  onAuthorFilterChange,
  onHide,
  onMaxVotesChange,
  onOpenActions,
  onPhaseChange,
  onReveal,
  onTakeFacilitation,
  onTimer,
  openActionCount,
  receivedAt,
}: {
  authorFilter: string[];
  board: Board;
  /** In DISCUSS, the speaking-order die, right after the step it belongs to. */
  dice?: ReactNode;
  /** Owned by the page, so an empty board can open the same dialog from its own button. */
  isAddingColumn: boolean;
  isBusy: boolean;
  /** Only the timer's own request holds its buttons: a note being saved should not. */
  isTimerBusy: boolean;
  onAddColumn: (title: string) => void;
  onAddingColumnChange: (isAdding: boolean) => void;
  onAuthorFilterChange: (authorIds: string[]) => void;
  onHide: () => void;
  onMaxVotesChange: (maxVotes: number) => void;
  onOpenActions: () => void;
  openActionCount: number;
  onPhaseChange: (phase: RetroPhase) => void;
  onReveal: () => void;
  onTakeFacilitation: () => void;
  onTimer: (action: TimerAction, seconds?: number) => void;
  /** When this board reached the client: what the timer's `remainingMs` was true at. */
  receivedAt: number;
}) => {
  const [newColumn, setNewColumn] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  // The board exposes no admin flag: the teams the user sees say it. An org admin who is
  // not a member of the team is admin without being a member, and cannot save its templates.
  const {data: teams} = useQuery({queryFn: fetchTeams, queryKey: ['teams']});
  const myTeam = teams?.find(({id}) => id === board.teamId);
  const canSaveAsTemplate = board.phase === 'DISCUSS' && Boolean(myTeam?.isAdmin && myTeam.isMember);
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

  const isIcebreaker = board.phase === 'ICEBREAKER';
  const isReview = board.phase === 'REVIEW';
  // An opening step only exists for a retro that uses it: an old retro keeps its track.
  const steps: RetroPhase[] = [
    ...(board.icebreaker || isIcebreaker ? (['ICEBREAKER'] as const) : []),
    ...(hasReviewStep(board) || isReview ? (['REVIEW'] as const) : []),
    ...WORKING_PHASES,
  ];
  const currentIndex = steps.indexOf(board.phase);
  const isLobby = board.phase === 'LOBBY';
  const openingPhase = nextOpeningPhase(board);
  const nextPhase = isLobby ? undefined : steps[currentIndex + 1];
  const isArchived = board.phase === 'ARCHIVED';
  const canReveal = ['SHARE', 'VOTE', 'DISCUSS'].includes(board.phase);
  const myNotes = board.columns.flatMap((column) =>
    column.cards.flatMap(({notes}) => notes.filter((note) => note.isMine)),
  );
  const hasHiddenNotes = myNotes.some(({revealed}) => !revealed);
  // The board's structure is settled while people write, and by the facilitator alone.
  const canAddColumn = board.isFacilitator && COLUMN_EDIT_PHASES.includes(board.phase);
  const hasColumns = board.columns.length > 0;
  // The opening steps need no column, and neither does the brainstorm they lead to.
  const canMoveOn = hasColumns || isIcebreaker || isReview;
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
        defaultSeconds={isIcebreaker ? ICEBREAKER_TIMER_SECONDS : board.defaultTimerSeconds}
        isBusy={isTimerBusy}
        isFacilitator={board.isFacilitator}
        key={isIcebreaker ? 'icebreaker' : 'retro'}
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

  // Only names every card already shows: filtering never tells more than the board does.
  const authors = boardAuthors(board);
  const authorNames = new Map(authors.map(({id, name}) => [id, name]));
  const selectedAuthors = authorFilter.filter((id) => authorNames.has(id));

  const filterBlock =
    authors.length > 1 ? (
      <Select
        inputProps={{'aria-label': 'Filter by person'}}
        displayEmpty
        multiple
        onChange={(event) => {
          const value = event.target.value as string[];
          onAuthorFilterChange(value.includes('') ? [] : value);
        }}
        renderValue={(ids: string[]) =>
          ids.length ? ids.map((id) => authorNames.get(id)).join(', ') : 'Everyone'
        }
        size="small"
        sx={{'& .MuiSelect-select': {py: 0.5}, maxWidth: 220, minWidth: 120}}
        value={selectedAuthors}
      >
        <MenuItem value="">Everyone</MenuItem>
        {authors.map(({id, name}) => (
          <MenuItem key={id} value={id}>
            {name}
          </MenuItem>
        ))}
      </Select>
    ) : null;

  const moveOnButton = (
    <Button
      disabled={isBusy || !canMoveOn}
      onClick={() => nextPhase && onPhaseChange(nextPhase)}
      variant="contained"
    >
      {isReview ? 'Start brainstorming' : `Move on to ${nextPhase ? PHASE_LABELS[nextPhase] : ''}`}
    </Button>
  );

  const startButton = (
    <Button
      disabled={isBusy}
      onClick={() => onPhaseChange(openingPhase)}
      variant="contained"
    >
      {openingPhase === 'ICEBREAKER' ? 'Start with the icebreaker' : 'Start the retro'}
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

      {isLobby ? startButton : null}

      {nextPhase ? (
        canMoveOn ? (
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

  const actionsBlock = (
    <Button
      onClick={onOpenActions}
      size="small"
      startIcon={<ChecklistOutlinedIcon />}
      sx={{fontVariantNumeric: 'tabular-nums'}}
      variant="outlined"
    >
      Actions · {openActionCount}
    </Button>
  );

  const templateBlock = canSaveAsTemplate ? (
    <Button
      onClick={() => setIsSavingTemplate(true)}
      size="small"
      startIcon={<BookmarkAddOutlinedIcon />}
      variant="text"
    >
      Save as template
    </Button>
  ) : null;

  const blocks = [
    timerBlock,
    myBlock,
    filterBlock,
    actionsBlock,
    templateBlock,
    facilitatorBlock,
  ].filter(Boolean);

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
            {steps.map((phase, index) => {
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
                      // On a phone the die needs a little of the track's width beside Discuss.
                      width: {xs: dice ? 54 : 64, sm: 92},
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

            {dice ? (
              <Box sx={{alignSelf: {xs: 'flex-start', sm: 'center'}, flexShrink: 0, ml: {xs: 0.5, sm: 1}}}>
                {dice}
              </Box>
            ) : null}

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
                Columns can only be added or removed before the retro starts or while people write.
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

        {canSaveAsTemplate ? (
          <SaveAsTemplateDialog
            board={board}
            key={isSavingTemplate ? 'open' : 'closed'}
            onClose={() => setIsSavingTemplate(false)}
            open={isSavingTemplate}
          />
        ) : null}
      </Stack>
    </Card>
  );
};
