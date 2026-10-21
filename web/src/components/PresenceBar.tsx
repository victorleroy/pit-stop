import {Avatar, Chip, Stack, Tooltip, Typography} from '@/ui';
import type {Participant} from '@/api/types';
import {initials} from '@/utils/initials';

export const PresenceBar = ({
  isConnected,
  participants,
}: {
  isConnected: boolean;
  participants: Participant[];
}) => (
  <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
    <Chip
      color={isConnected ? 'success' : 'default'}
      label={isConnected ? 'Live' : 'Reconnecting…'}
      size="small"
      variant="outlined"
    />

    <Stack direction="row" spacing={0.5} sx={{alignItems: 'center'}}>
      {participants.map((participant) => (
        <Tooltip key={participant.userId} title={participant.name}>
          <Avatar size="small" src={participant.pictureUrl}>
            {initials(participant.name)}
          </Avatar>
        </Tooltip>
      ))}
    </Stack>

    {participants.length > 0 ? (
      <Typography color="textSecondary" variant="textXs">
        {participants.length} online
      </Typography>
    ) : null}
  </Stack>
);
