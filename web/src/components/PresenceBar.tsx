import {Box, Chip, Stack, Tooltip, Typography} from '@/ui';
import type {Board, Participant} from '@/api/types';
import {UserAvatar} from '@/components/UserAvatar';
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
            {/* A span to hang the tooltip on: the avatar itself takes no ref. */}
            <Box component="span" sx={{display: 'inline-flex'}}>
              <UserAvatar
                {...participant}
                size="small"
                sx={{
                  ...(progress?.used(participant.userId) === board.maxVotes && {
                    outline: '2px solid',
                    outlineColor: 'success.main',
                    outlineOffset: '1px',
                  }),
                }}
              />
            </Box>
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
