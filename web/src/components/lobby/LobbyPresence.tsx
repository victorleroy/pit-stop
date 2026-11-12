import {keyframes} from '@mui/material/styles';
import type {Participant, TeamMember} from '@/api/types';
import {MAX_TOOLTIP_LINES} from '@/components/PresenceBar';
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

const arrive = keyframes`
  from { opacity: 0; transform: translateY(6px) scale(0.85); }
  to { opacity: 1; transform: none; }
`;

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
    sx={{display: 'flex', flexWrap: 'wrap', gap: isPresent ? 1.5 : 0.75, listStyle: 'none', m: 0, p: 0}}
  >
    {members.map((member) => (
      <Box
        component="li"
        key={member.userId}
        sx={
          isPresent
            ? {
                animation: `${arrive} 260ms ease-out both`,
                '@media (prefers-reduced-motion: reduce)': {animation: 'none'},
              }
            : undefined
        }
      >
        <Tooltip title={member.name}>
          <Box
            aria-label={`${member.name}, ${isPresent ? 'here' : 'not here yet'}`}
            role="img"
            sx={{
              alignItems: 'center',
              display: 'flex',
              filter: isPresent ? 'none' : 'grayscale(1)',
              flexDirection: 'column',
              gap: 0.5,
              opacity: isPresent ? 1 : 0.5,
              width: isPresent ? 64 : 'auto',
            }}
          >
            <UserAvatar
              decorative
              name={member.name}
              pictureUrl={member.pictureUrl}
              size={isPresent ? 'medium' : 'small'}
              userId={member.userId}
            />
            {isPresent ? (
              <Typography
                aria-hidden
                sx={{maxWidth: '100%', overflow: 'hidden', textAlign: 'center', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}
                variant="textXs"
              >
                {member.name.split(' ')[0]}
              </Typography>
            ) : null}
          </Box>
        </Tooltip>
      </Box>
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

  const {absent, here, present} = lobbyPresence(members, participants);
  const shownPresent = present.slice(0, MAX_AVATARS);
  const shownAbsent = absent.slice(0, MAX_AVATARS - shownPresent.length);
  const hidden = [...present.slice(shownPresent.length), ...absent.slice(shownAbsent.length)];
  const isEveryoneHere = members.length > 0 && absent.length === 0;

  return (
    <Stack spacing={1.5}>
      <Typography component="h3" variant="headingS">
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

      {hidden.length > 0 ? (
        <Tooltip
          title={
            <Box component="span" sx={{whiteSpace: 'pre-line'}}>
              {[
                ...hidden
                  .slice(0, MAX_TOOLTIP_LINES)
                  .map(({name, userId}) => (here.has(userId) ? name : `${name} · not here yet`)),
                ...(hidden.length > MAX_TOOLTIP_LINES ? [`+${hidden.length - MAX_TOOLTIP_LINES} more`] : []),
              ].join('\n')}
            </Box>
          }
        >
          <Typography
            aria-label={`${hidden.length} more`}
            color="textSecondary"
            sx={{alignSelf: 'flex-start'}}
            tabIndex={0}
            variant="textXs"
          >
            +{hidden.length}
          </Typography>
        </Tooltip>
      ) : null}
    </Stack>
  );
};
