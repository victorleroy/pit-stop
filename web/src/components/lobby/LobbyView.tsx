import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Divider from '@mui/material/Divider';
import type {ReactNode} from 'react';
import type {Participant, TeamMember} from '@/api/types';
import {LOBBY_TITLE} from '@/components/lobby/lobbyCopy';
import {LobbyPresence} from '@/components/lobby/LobbyPresence';
import {Box, Button, Stack, Typography} from '@/ui';

export const LobbyView = ({
  facilitatorId,
  game,
  isConnected,
  isFacilitator,
  isStarting = false,
  isTakingOver = false,
  members,
  onSetUpBoard,
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
  isConnected: boolean;
  isFacilitator: boolean;
  isStarting?: boolean;
  isTakingOver?: boolean;
  members: TeamMember[] | undefined;
  onSetUpBoard?: () => void;
  onStart: () => void;
  onTakeOver?: () => void;
  open?: boolean;
  participants: Participant[];
  /** The facilitator's own card, under the welcome: nothing for everyone else. */
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

  return (
    <Dialog
      aria-labelledby="waiting-room-title"
      fullWidth
      maxWidth="sm"
      open={open}
      slotProps={{paper: {sx: {m: 2, maxHeight: 'calc(100% - 32px)', width: 'calc(100% - 32px)'}}}}
    >
      <DialogContent sx={{p: {sm: 4, xs: 2.5}}}>
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

          {isFacilitator ? (
            <Stack direction={{sm: 'row', xs: 'column'}} spacing={1.5} sx={{alignItems: {sm: 'center', xs: 'stretch'}}}>
              <Button disabled={isStarting} onClick={onStart} size="large" variant="contained">
                {startLabel}
              </Button>
              {onSetUpBoard ? (
                <Button onClick={onSetUpBoard} variant="text">
                  Set up the board
                </Button>
              ) : null}
            </Stack>
          ) : (
            <Box sx={{alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 1}}>
              <Typography role="status" variant="textM">
                Waiting for {facilitatorName} to start the retro
              </Typography>
              {isFacilitatorAbsent && onTakeOver ? (
                <Button disabled={isTakingOver} onClick={onTakeOver} size="small" variant="outlined">
                  Take over facilitation
                </Button>
              ) : null}
            </Box>
          )}

          {game ? (
            <>
              <Divider />
              <Box sx={{minWidth: 0}}>{game}</Box>
            </>
          ) : null}
        </Stack>
      </DialogContent>
    </Dialog>
  );
};
