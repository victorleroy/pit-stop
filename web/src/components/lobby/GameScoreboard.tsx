import type {GameScore, Participant} from '@/api/types';
import {UserAvatar} from '@/components/UserAvatar';
import {Box, Typography} from '@/ui';

export const SCOREBOARD_TOP = 5;

const cell = {borderBottom: '1px solid', borderColor: 'divider', py: 0.5};

/** Present players come with their current profile: it beats the one the last hit carried. */
const identity = (score: GameScore, participants: Participant[]) => {
  const present = participants.find(({userId}) => userId === score.userId);

  return {name: present?.name ?? score.name, pictureUrl: present ? present.pictureUrl : score.pictureUrl};
};

export const GameScoreboard = ({
  myUserId,
  participants = [],
  scores,
}: {
  myUserId?: string;
  participants?: Participant[];
  scores: GameScore[];
}) => {
  if (!scores.some(({points}) => points > 0)) return null;

  const top = scores.slice(0, SCOREBOARD_TOP);
  const mineIndex = scores.findIndex(({userId}) => userId === myUserId);
  const mine = mineIndex >= SCOREBOARD_TOP ? scores[mineIndex] : undefined;
  const others = scores.length - top.length - (mine ? 1 : 0);

  const row = (score: GameScore, rank: number) => {
    const {name, pictureUrl} = identity(score, participants);

    return (
      <Box
        component="tr"
        key={score.userId}
        sx={{fontWeight: score.userId === myUserId ? 700 : 400}}
      >
        <Box component="td" sx={{...cell, color: 'text.secondary', width: 28}}>
          {rank}
        </Box>
        <Box component="td" sx={cell}>
          <Box sx={{alignItems: 'center', display: 'flex', gap: 1, minWidth: 0}}>
            <UserAvatar name={name} pictureUrl={pictureUrl} size="small" userId={score.userId} />
            <Typography noWrap sx={{fontWeight: 'inherit'}} variant="textS">
              {name}
              {score.userId === myUserId ? ' (you)' : ''}
            </Typography>
          </Box>
        </Box>
        <Box component="td" sx={{...cell, textAlign: 'right'}}>
          {score.points}
        </Box>
      </Box>
    );
  };

  return (
    <Box>
      <Box component="table" sx={{borderCollapse: 'collapse', fontSize: 14, width: '100%'}}>
        <Box
          component="caption"
          sx={{clip: 'rect(0 0 0 0)', height: '1px', overflow: 'hidden', position: 'absolute', width: '1px'}}
        >
          Wheel Gun scores
        </Box>
        <Box component="thead">
          <Box component="tr" sx={{textAlign: 'left'}}>
            <Box component="th" scope="col" sx={{...cell, fontWeight: 600, width: 28}}>
              #
            </Box>
            <Box component="th" scope="col" sx={{...cell, fontWeight: 600}}>
              Player
            </Box>
            <Box component="th" scope="col" sx={{...cell, fontWeight: 600, textAlign: 'right'}}>
              Points
            </Box>
          </Box>
        </Box>
        <Box component="tbody">
          {top.map((score, index) => row(score, index + 1))}
          {mine ? row(mine, mineIndex + 1) : null}
        </Box>
      </Box>

      {others > 0 ? (
        <Typography color="textSecondary" sx={{mt: 0.5}} variant="textXs">
          +{others} others
        </Typography>
      ) : null}
    </Box>
  );
};
