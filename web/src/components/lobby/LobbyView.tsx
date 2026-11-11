import {useTheme} from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import type {ReactNode} from 'react';
import type {Participant, TeamMember} from '@/api/types';
import {LOBBY_TITLE} from '@/components/lobby/lobbyCopy';
import {LobbyPresence} from '@/components/lobby/LobbyPresence';
import {PrimeDirective} from '@/components/lobby/PrimeDirective';
import {Box, Button, Stack, Typography} from '@/ui';

export const LobbyView = ({
  facilitatorId,
  game,
  isConnected,
  isFacilitator,
  isStarting = false,
  members,
  onStart,
  participants,
  retroTitle,
  startLabel = 'Start the retro',
  teamName,
}: {
  facilitatorId: string;
  /** Where the shared game mounts: right column on a wide screen, after the presence on a phone. */
  game?: ReactNode;
  isConnected: boolean;
  isFacilitator: boolean;
  isStarting?: boolean;
  members: TeamMember[] | undefined;
  onStart: () => void;
  participants: Participant[];
  retroTitle: string;
  startLabel?: string;
  teamName?: string;
}) => {
  const isWide = useMediaQuery(useTheme().breakpoints.up('md'));
  const facilitatorName = members?.find(({userId}) => userId === facilitatorId)?.name;
  // The socket opens before the first presence arrives, and a subscriber always counts itself.
  const isPresenceKnown = isConnected && participants.length > 0;
  const isFacilitatorAbsent =
    isPresenceKnown && !participants.some(({userId}) => userId === facilitatorId);

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateAreas: {
          md: '"welcome game" "prime game" "presence game"',
          xs: '"welcome" "presence" "game" "prime"',
        },
        gridTemplateColumns: {md: '2fr 3fr', xs: 'minmax(0, 1fr)'},
        gridTemplateRows: {md: 'auto auto 1fr'},
        minWidth: 0,
      }}
    >
      <Stack component="section" spacing={0.5} sx={{gridArea: 'welcome', minWidth: 0}}>
        <Typography component="h2" variant="headingL">
          {LOBBY_TITLE}
        </Typography>
        <Typography color="textSecondary" sx={{overflowWrap: 'anywhere'}} variant="textS">
          {[retroTitle, teamName].filter(Boolean).join(' · ')}
        </Typography>
      </Stack>

      <Box sx={{gridArea: 'prime', minWidth: 0}}>
        <PrimeDirective isCollapsible={!isWide} />
      </Box>

      <Stack component="section" spacing={2} sx={{alignItems: 'flex-start', gridArea: 'presence', minWidth: 0}}>
        <LobbyPresence isConnected={isPresenceKnown} members={members} participants={participants} />

        {isFacilitator ? (
          <Button disabled={isStarting} onClick={onStart} variant="contained">
            {startLabel}
          </Button>
        ) : isFacilitatorAbsent ? (
          <Typography role="status" variant="textM">
            Waiting for {facilitatorName ?? 'the facilitator'} to start. You can take over from the toolbar.
          </Typography>
        ) : null}
      </Stack>

      <Box sx={{gridArea: 'game', minWidth: 0}}>{game}</Box>
    </Box>
  );
};
