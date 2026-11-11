import type {Participant, TeamMember} from '@/api/types';
import {UserAvatar} from '@/components/UserAvatar';
import {Box, Stack, Tooltip, Typography} from '@/ui';

// Two rows of avatars on the narrowest column: past that, a count says the rest.
export const MAX_AVATARS = 16;

export const lobbyPresence = (members: TeamMember[], participants: Participant[]) => {
  const here = new Set(participants.map(({userId}) => userId));
  const present = members.filter(({userId}) => here.has(userId));
  const absent = members.filter(({userId}) => !here.has(userId));

  return {absent, here, present};
};

const Avatars = ({
  isPresent,
  label,
  members,
}: {
  isPresent: boolean;
  label: string;
  members: TeamMember[];
}) => (
  <Box
    aria-label={label}
    component="ul"
    sx={{display: 'flex', flexWrap: 'wrap', gap: 0.75, listStyle: 'none', m: 0, p: 0}}
  >
    {members.map((member) => (
      <li key={member.userId}>
        <Tooltip title={member.name}>
          <Box
            aria-label={`${member.name}, ${isPresent ? 'here' : 'not here yet'}`}
            role="img"
            sx={{display: 'flex', filter: isPresent ? 'none' : 'grayscale(1)', opacity: isPresent ? 1 : 0.5}}
          >
            <UserAvatar
              name={member.name}
              pictureUrl={member.pictureUrl}
              size="medium"
              userId={member.userId}
            />
          </Box>
        </Tooltip>
      </li>
    ))}
  </Box>
);

export const LobbyPresence = ({
  isConnected,
  members,
  participants,
}: {
  isConnected: boolean;
  members: TeamMember[] | undefined;
  participants: Participant[];
}) => {
  if (!isConnected) {
    return (
      <Typography color="textSecondary" role="status" variant="textS">
        Reconnecting…
      </Typography>
    );
  }

  if (!members) return null;

  const {absent, present} = lobbyPresence(members, participants);
  const shownPresent = present.slice(0, MAX_AVATARS);
  const shownAbsent = absent.slice(0, MAX_AVATARS - shownPresent.length);
  const hidden = members.length - shownPresent.length - shownAbsent.length;
  const isEveryoneHere = members.length > 0 && absent.length === 0;

  return (
    <Stack spacing={1.5}>
      <Typography component="h2" variant="headingS">
        {present.length}/{members.length} joined
      </Typography>

      {isEveryoneHere ? (
        <Typography color="textSecondary" variant="textS">
          Everyone is here
        </Typography>
      ) : null}

      {shownPresent.length > 0 ? (
        <Avatars isPresent label="Here" members={shownPresent} />
      ) : null}

      {shownAbsent.length > 0 ? (
        <Stack spacing={0.75}>
          <Typography color="textSecondary" variant="textXs">
            Not here yet
          </Typography>
          <Avatars isPresent={false} label="Not here yet" members={shownAbsent} />
        </Stack>
      ) : null}

      {hidden > 0 ? (
        <Typography color="textSecondary" variant="textXs">
          +{hidden}
        </Typography>
      ) : null}
    </Stack>
  );
};
