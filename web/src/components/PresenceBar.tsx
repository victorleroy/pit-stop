import {Avatar, Chip, Stack, Tooltip, Typography} from '@/ui';
import type {Board, Participant} from '@/api/types';
import {initials} from '@/utils/initials';
import {userColour} from '@/utils/userColour';
import {voteProgress} from '@/utils/voteProgress';

export const PresenceBar = ({
  board,
  isConnected,
  participants,
}: {
  board: Board;
  isConnected: boolean;
  participants: Participant[];
}) => {
  const progress = board.phase === 'VOTE' ? voteProgress(board, participants) : undefined;

  return (
    <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
      <Chip
        color={isConnected ? 'success' : 'default'}
        label={isConnected ? 'Live' : 'Reconnecting…'}
        size="small"
        variant="outlined"
      />

      <Stack direction="row" spacing={0.5} sx={{alignItems: 'center'}}>
        {participants.map((participant) => (
          <Tooltip
            key={participant.userId}
            title={
              progress
                ? `${participant.name} · ${progress.used(participant.userId)}/${board.maxVotes} votes`
                : participant.name
            }
          >
            <Avatar
              size="small"
              src={participant.pictureUrl}
              sx={{
                bgcolor: userColour(participant.userId),
                color: '#FFFFFF',
                ...(progress?.used(participant.userId) === board.maxVotes && {
                  outline: '2px solid',
                  outlineColor: 'success.main',
                  outlineOffset: '1px',
                }),
              }}
            >
              {initials(participant.name)}
            </Avatar>
          </Tooltip>
        ))}
      </Stack>

      {participants.length > 0 ? (
        <Typography color="textSecondary" variant="textXs">
          {progress ? `${progress.done}/${progress.total} done voting` : `${participants.length} online`}
        </Typography>
      ) : null}
    </Stack>
  );
};
