import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Divider from '@mui/material/Divider';
import type {ReactNode} from 'react';
import type {Participant, TeamMember} from '@/api/types';
import {ICEBREAKER_TITLE_ID} from '@/components/icebreaker/IcebreakerQuestion';
import {LOBBY_TITLE} from '@/components/lobby/lobbyCopy';
import {LobbyPresence} from '@/components/lobby/LobbyPresence';
import {Box, Button, Stack, Typography} from '@/ui';

export const LobbyView = ({
  facilitatorId,
  game,
  icebreaker,
  isConnected,
  isFacilitator,
  isStarting = false,
  isTakingOver = false,
  members,
  onSetUpBoard,
  onSkipIcebreaker,
  onStart,
  onTakeOver,
  open = true,
  participants,
  preview,
  retroTitle,
  startLabel = 'Start the retro',
  teamName,
}: {
  facilitatorId: string;
  /** Mounted below the people, inside the dialog. */
  game?: ReactNode;
  /** Step 2: replaces the waiting room body with the icebreaker. */
  icebreaker?: ReactNode;
  isConnected: boolean;
  isFacilitator: boolean;
  isStarting?: boolean;
  isTakingOver?: boolean;
  members: TeamMember[] | undefined;
  onSetUpBoard?: () => void;
  /** Offered next to the start when an icebreaker is on the menu: skips it. */
  onSkipIcebreaker?: () => void;
  onStart: () => void;
  onTakeOver?: () => void;
  open?: boolean;
  participants: Participant[];
  /** The facilitator's own settings for the start, above the people: nothing for everyone else. */
  preview?: ReactNode;
  retroTitle: string;
  startLabel?: string;
  teamName?: string;
}) => {
  const facilitatorName = members?.find(({userId}) => userId === facilitatorId)?.name ?? 'the facilitator';
  // The socket opens before the first presence arrives, and a subscriber always counts itself.
  const isPresenceKnown = isConnected && participants.length > 0;
  const isFacilitatorAbsent =
    isPresenceKnown && !participants.some(({userId}) => userId === facilitatorId);
  const titleId = icebreaker ? ICEBREAKER_TITLE_ID : 'waiting-room-title';

  const controls = isFacilitator ? (
    // Labels stay on one line: the row wraps between buttons, never inside one.
    <Stack
      direction={{sm: 'row', xs: 'column'}}
      sx={{alignItems: {sm: 'center', xs: 'stretch'}, columnGap: 1.5, flexWrap: 'wrap', rowGap: 1, '& .MuiButton-root': {whiteSpace: 'nowrap'}}}
      useFlexGap
    >
      <Button disabled={isStarting} onClick={onStart} size="large" variant="contained">
        {startLabel}
      </Button>
      {onSkipIcebreaker && !icebreaker ? (
        <>
          <Typography color="textSecondary" sx={{textAlign: 'center'}} variant="textS">
            or
          </Typography>
          <Button disabled={isStarting} onClick={onSkipIcebreaker} variant="outlined">
            Start without icebreaker
          </Button>
        </>
      ) : null}
      {onSetUpBoard && !icebreaker ? (
        <Button onClick={onSetUpBoard} variant="text">
          Set up the board
        </Button>
      ) : null}
    </Stack>
  ) : (
    <Box sx={{alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 1}}>
      <Typography role="status" variant="textM">
        Waiting for {facilitatorName} to {icebreaker ? 'move on' : 'start the retro'}
      </Typography>
      {isFacilitatorAbsent && onTakeOver ? (
        <Button disabled={isTakingOver} onClick={onTakeOver} size="small" variant="outlined">
          Take over facilitation
        </Button>
      ) : null}
    </Box>
  );

  return (
    <Dialog
      aria-labelledby={titleId}
      fullWidth
      maxWidth={icebreaker ? 'md' : 'sm'}
      open={open}
      slotProps={{paper: {sx: {m: 2, maxHeight: 'calc(100% - 32px)', width: 'calc(100% - 32px)'}}}}
    >
      <DialogContent sx={{p: {sm: 4, xs: 2.5}}}>
        {icebreaker ? (
          <Stack spacing={3}>
            {icebreaker}
            {controls}
          </Stack>
        ) : (
          <Stack spacing={3}>
            <Stack spacing={0.5}>
              <Typography component="h2" id="waiting-room-title" variant="headingL">
                {LOBBY_TITLE}
              </Typography>
              <Typography color="textSecondary" sx={{overflowWrap: 'anywhere'}} variant="textS">
                {[retroTitle, teamName].filter(Boolean).join(' · ')}
              </Typography>
            </Stack>

            {preview ? <Box sx={{minWidth: 0}}>{preview}</Box> : null}

            <LobbyPresence isConnected={isPresenceKnown} members={members} participants={participants} />

            {controls}

            {game ? (
              <>
                <Divider />
                <Box sx={{minWidth: 0}}>{game}</Box>
              </>
            ) : null}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
};
