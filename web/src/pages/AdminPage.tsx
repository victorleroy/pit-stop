import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  IconButton,
  Loader,
  Select,
  Stack,
  Tag,
  TextField,
  Typography,
} from '@/ui';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import {keepPreviousData, useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {useState} from 'react';
import {Link, Navigate} from 'react-router-dom';
import {fetchPublicConfig} from '@/api/auth';
import {fetchInvitations, fetchOrgStats, inviteToOrg, revokeInvitation} from '@/api/org';
import {fetchOrgMembers, fetchTeams, setOrgAdmin} from '@/api/teams';
import type {Invitation, OrgMember, OrgRole, StatsPeriod} from '@/api/types';
import {useAuth} from '@/contexts/AuthContext';
import {useToast} from '@/contexts/ToastContext';
import {TeamDot} from '@/components/TeamDot';
import {noteColours, SURFACE, teamColour} from '@/theme/texture';
import {initials} from '@/utils/initials';

const MemberRow = ({
  member,
  onOpenMenu,
}: {
  member: OrgMember;
  onOpenMenu: (anchor: HTMLElement) => void;
}) => (
  <Stack
    direction="row"
    spacing={2}
    sx={{
      '&:hover': {bgcolor: 'action.hover'},
      alignItems: 'center',
      borderRadius: '10px',
      flexWrap: 'wrap',
      px: 1.25,
      py: 1.25,
      transition: 'background-color 120ms ease',
    }}
    useFlexGap
  >
    <Avatar size="small" src={member.pictureUrl}>
      {initials(member.name)}
    </Avatar>

    <Stack spacing={0.25} sx={{minWidth: 180}}>
      <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
        <Typography variant="textM">{member.name}</Typography>
        {member.isOrgAdmin ? (
          <Tag color="primary" size="small">
            Org admin
          </Tag>
        ) : null}
      </Stack>
      <Typography color="textSecondary" variant="textXs">
        {member.email}
      </Typography>
    </Stack>

    <Stack direction="row" spacing={0.75} sx={{flexGrow: 1, flexWrap: 'wrap'}} useFlexGap>
      {member.teams.length === 0 ? (
        <Typography color="textSecondary" variant="textXs">
          No team yet
        </Typography>
      ) : null}

      {member.teams.map((team) => (
        <Link key={team.id} style={{textDecoration: 'none'}} to={`/teams/${team.id}`}>
          <Tag colour={teamColour(team.name).strong} size="small">
            {team.isAdmin ? `${team.name} · admin` : team.name}
          </Tag>
        </Link>
      ))}
    </Stack>

    <IconButton
      aria-label={`Actions for ${member.name}`}
      onClick={(event) => onOpenMenu(event.currentTarget)}
      size="small"
    >
      <MoreHorizIcon fontSize="small" />
    </IconButton>
  </Stack>
);

const PERIODS: {label: string; value: StatsPeriod}[] = [
  {label: 'Last 30 days', value: '30d'},
  {label: 'Last quarter', value: '90d'},
  {label: 'All time', value: 'all'},
];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const StatTile = ({
  children,
  label,
  marker,
  value,
}: {
  children?: ReactNode;
  label: string;
  marker?: ReactNode;
  value: number;
}) => (
  <Stack spacing={0.5} sx={{...SURFACE, minWidth: 0, px: 2.5, py: 2}}>
    <Stack direction="row" spacing={0.75} sx={{alignItems: 'center'}}>
      {marker}
      <Typography color="textSecondary" variant="textXs">
        {label}
      </Typography>
    </Stack>
    <Typography sx={{fontVariantNumeric: 'tabular-nums'}} variant="headingL">
      {value.toLocaleString('en-GB')}
    </Typography>
    {children}
  </Stack>
);

/**
 * How the organisation uses the product, in counters only: nothing here reads a board, so an
 * org admin learns how much the teams retro, never what they said or who said it.
 */
const Stats = () => {
  const {user} = useAuth();
  const [period, setPeriod] = useState<StatsPeriod>('30d');

  // The previous period stays on screen while the next one loads: the tiles change their
  // numbers rather than blinking empty.
  const {data: stats, error} = useQuery({
    enabled: Boolean(user?.isOrgAdmin),
    placeholderData: keepPreviousData,
    queryFn: () => fetchOrgStats(period),
    queryKey: ['org', 'stats', period],
  });

  const closed = stats ? stats.actions.done + stats.actions.dropped : 0;
  const note = noteColours(0);

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        spacing={2}
        sx={{alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between'}}
        useFlexGap
      >
        <Typography variant="headingS">Activity</Typography>
        <ToggleButtonGroup
          aria-label="Period"
          exclusive
          onChange={(_event, value: StatsPeriod | null) => {
            // Clicking the selected period again would unselect it: there is always one.
            if (value) setPeriod(value);
          }}
          size="small"
          value={period}
        >
          {PERIODS.map(({label, value}) => (
            <ToggleButton key={value} sx={{px: 1.5, textTransform: 'none'}} value={value}>
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {error ? <Alert severity="error">{error.message}</Alert> : null}

      {stats ? (
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}
        >
          <StatTile label="People" value={stats.people.total}>
            <Typography color="textSecondary" variant="textXs">
              {plural(stats.people.admins, 'admin')}
            </Typography>
          </StatTile>

          <StatTile label="Teams" value={stats.teams.total}>
            <Typography
              sx={{color: stats.teams.idle > 0 ? 'warning.main' : 'text.secondary'}}
              variant="textXs"
            >
              {stats.teams.idle > 0 ? `${stats.teams.idle} idle for 30 days` : 'All active lately'}
            </Typography>
          </StatTile>

          <StatTile label="Retros" value={stats.retros.count}>
            <Typography color="textSecondary" variant="textXs">
              {stats.retros.total.toLocaleString('en-GB')} all time
            </Typography>
          </StatTile>

          <StatTile
            label="Post-its"
            marker={
              <Box
                aria-hidden
                sx={{
                  bgcolor: note.paper,
                  border: '1px solid',
                  borderColor: 'rgba(10, 37, 64, 0.12)',
                  height: 10,
                  transform: 'rotate(-6deg)',
                  width: 10,
                }}
              />
            }
            value={stats.notes.count}
          >
            <Typography color="textSecondary" variant="textXs">
              {stats.notes.perRetro.toLocaleString('en-GB')} per retro
            </Typography>
          </StatTile>

          <StatTile label="Open actions" value={stats.actions.open}>
            <Typography color="textSecondary" variant="textXs">
              {stats.actions.open + closed === 0
                ? 'No action decided yet'
                : `${stats.actions.done} done · ${stats.actions.dropped} dropped`}
              {closed > 0
                ? ` · ${Math.round((stats.actions.done / closed) * 100)}% done rate`
                : ''}
            </Typography>
          </StatTile>
        </Box>
      ) : error ? null : (
        <Stack sx={{alignItems: 'center', py: 3}}>
          <Loader size={24} />
        </Stack>
      )}
    </Stack>
  );
};

const STATUS_COLOURS: Record<Invitation['status'], string> = {
  accepted: '#0E9F6E',
  expired: '#8792A2',
  pending: '#D97706',
  revoked: '#8792A2',
};

const Invitations = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('member');

  const {data: config} = useQuery({queryKey: ['config'], queryFn: fetchPublicConfig});
  const {data: invitations, error: invitationsError} = useQuery({
    queryFn: fetchInvitations,
    queryKey: ['org', 'invitations'],
  });

  const refresh = () => queryClient.invalidateQueries({queryKey: ['org', 'invitations']});

  const invite = useMutation({
    mutationFn: (input: {email: string; role: OrgRole}) => inviteToOrg(input.email, input.role),
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: (_invitation, input) => {
      toast.success(
        config?.mailEnabled
          ? `Invitation sent to ${input.email}.`
          : `Invitation created for ${input.email}. Its link is in the service logs.`,
      );
      setEmail((current) => (current === input.email ? '' : current));
      void refresh();
    },
  });

  const revoke = useMutation({
    mutationFn: revokeInvitation,
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: () => void refresh(),
  });

  return (
    <Stack spacing={2} sx={{...SURFACE, p: 3}}>
      <Typography variant="headingS">Invitations</Typography>

      {invitationsError ? <Alert severity="error">{invitationsError.message}</Alert> : null}

      {config && !config.mailEnabled ? (
        <Alert severity="info">
          This instance sends no email. Each invitation link is printed in the service logs:
          ask whoever operates the instance to pass it on.
        </Alert>
      ) : null}

      <Stack direction="row" spacing={1.5} sx={{alignItems: 'center', flexWrap: 'wrap'}} useFlexGap>
        <TextField
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && email) invite.mutate({email, role});
          }}
          placeholder="colleague@company.com"
          size="small"
          sx={{flexGrow: 1, minWidth: 220}}
          type="email"
          value={email}
        />
        <Select
          onChange={(event) => setRole(event.target.value as OrgRole)}
          size="small"
          value={role}
        >
          <MenuItem value="member">Member</MenuItem>
          <MenuItem value="admin">Administrator</MenuItem>
        </Select>
        <Button
          disabled={!email || invite.isPending}
          onClick={() => invite.mutate({email, role})}
          variant="contained"
        >
          Invite
        </Button>
      </Stack>

      <Stack>
        {invitations?.map((invitation) => (
          <Stack
            direction="row"
            key={invitation.id}
            spacing={2}
            sx={{
              alignItems: 'center',
              borderTop: '1px solid',
              borderTopColor: 'divider',
              flexWrap: 'wrap',
              py: 1.5,
            }}
            useFlexGap
          >
            <Typography sx={{flexGrow: 1}} variant="textM">
              {invitation.email}
            </Typography>
            {invitation.role === 'admin' ? (
              <Tag color="primary" size="small">
                Admin
              </Tag>
            ) : null}
            <Tag colour={STATUS_COLOURS[invitation.status]} size="small">
              {invitation.status}
            </Tag>
            {invitation.status === 'pending' ? (
              <Button
                color="error"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(invitation.id)}
                size="small"
                variant="text"
              >
                Revoke
              </Button>
            ) : null}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
};

export const AdminPage = () => {
  const {user} = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const {data: members, isLoading} = useQuery({
    enabled: Boolean(user?.isOrgAdmin),
    queryFn: fetchOrgMembers,
    queryKey: ['org', 'members'],
  });
  const {data: teams} = useQuery({queryFn: fetchTeams, queryKey: ['teams']});
  const [search, setSearch] = useState('');
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [memberMenu, setMemberMenu] = useState<
    {anchor: HTMLElement; member: OrgMember} | undefined
  >(undefined);
  const [isMemberMenuOpen, setIsMemberMenuOpen] = useState(false);

  const setAdminMutation = useMutation({
    mutationFn: ({isAdmin, userId}: {isAdmin: boolean; userId: string}) =>
      setOrgAdmin(userId, isAdmin),
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: ['org']});
      void queryClient.invalidateQueries({queryKey: ['teams']});
    },
  });

  if (user && !user.isOrgAdmin) {
    return <Navigate replace to="/teams" />;
  }

  const admins = (members ?? []).filter(({isOrgAdmin}) => isOrgAdmin);
  const query = search.trim().toLowerCase();
  const shownMembers = (members ?? []).filter(
    (member) =>
      (!adminsOnly || member.isOrgAdmin) &&
      (!query ||
        [member.name, member.email, ...member.teams.map(({name}) => name)].some((text) =>
          text.toLowerCase().includes(query),
        )),
  );

  return (
    <Stack spacing={4}>
      <Stats />

      {isLoading ? (
        <Stack sx={{alignItems: 'center', py: 6}}>
          <Loader />
        </Stack>
      ) : null}

      <Stack spacing={2} sx={{...SURFACE, p: 3}}>
        <Stack spacing={0.5}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{alignItems: 'center', flexWrap: 'wrap'}}
            useFlexGap
          >
            <Typography sx={{flexGrow: 1}} variant="headingS">
              People{' '}
              <Typography color="textSecondary" component="span" variant="textS">
                {members?.length ?? 0}
              </Typography>
            </Typography>
            <TextField
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, e-mail or team"
              size="small"
              slotProps={{
                htmlInput: {'aria-label': 'Search people'},
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{minWidth: 220}}
              value={search}
            />
            <Chip
              aria-pressed={adminsOnly}
              color={adminsOnly ? 'primary' : 'default'}
              label="Admins only"
              onClick={() => setAdminsOnly((current) => !current)}
              variant={adminsOnly ? 'filled' : 'outlined'}
            />
          </Stack>
          {admins.length === 1 ? (
            <Typography color="textSecondary" variant="textXs">
              There must be at least one administrator: name somebody else before stepping down.
            </Typography>
          ) : null}
        </Stack>

        {/* The list scrolls on its own: the search above stays in reach in a large organisation.
            It reaches into the padding, so a row's hover lines its text up with the heading. */}
        <Stack spacing={0.25} sx={{maxHeight: 480, mx: -1.25, overflowY: 'auto'}}>
          {shownMembers.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              onOpenMenu={(anchor) => {
                setMemberMenu({anchor, member});
                setIsMemberMenuOpen(true);
              }}
            />
          ))}

          {members && members.length > 0 && shownMembers.length === 0 ? (
            <Typography color="textSecondary" sx={{px: 1.25, py: 2}} variant="textS">
              Nobody matches this search.
            </Typography>
          ) : null}
        </Stack>

        <Menu
          anchorEl={memberMenu?.anchor}
          anchorOrigin={{horizontal: 'right', vertical: 'bottom'}}
          onClose={() => setIsMemberMenuOpen(false)}
          open={isMemberMenuOpen}
          transformOrigin={{horizontal: 'right', vertical: 'top'}}
        >
          {memberMenu ? (
            <MenuItem
              disabled={
                setAdminMutation.isPending ||
                (memberMenu.member.isOrgAdmin === true && admins.length === 1)
              }
              onClick={() => {
                const {member} = memberMenu;
                setAdminMutation.mutate({isAdmin: !member.isOrgAdmin, userId: member.id});
                setIsMemberMenuOpen(false);
              }}
            >
              <ListItemText
                primary={memberMenu.member.isOrgAdmin ? 'Remove org admin' : 'Make org admin'}
                secondary={
                  memberMenu.member.isOrgAdmin && admins.length === 1
                    ? 'The organisation needs at least one admin'
                    : undefined
                }
              />
            </MenuItem>
          ) : null}
        </Menu>
      </Stack>

      <Invitations />

      <Stack spacing={2} sx={{...SURFACE, p: 3}}>
        <Typography variant="headingS">
          Teams{' '}
          <Typography color="textSecondary" component="span" variant="textS">
            {teams?.length ?? 0}
          </Typography>
        </Typography>

        <Stack direction="row" spacing={1.5} sx={{flexWrap: 'wrap'}} useFlexGap>
          {teams?.map((team) => (
            <Stack
              component={Link}
              direction="row"
              key={team.id}
              spacing={1.5}
              sx={{
                ...SURFACE,
                '&:hover': {borderColor: 'primary.main'},
                alignItems: 'center',
                color: 'inherit',
                px: 2,
                py: 1.5,
                textDecoration: 'none',
                transition: 'border-color 120ms ease',
              }}
              to={`/teams/${team.id}`}
            >
              <TeamDot name={team.name} />
              <Typography variant="textM">{team.name}</Typography>
              <Typography color="textSecondary" variant="textXs">
                {team.memberCount} member{team.memberCount > 1 ? 's' : ''}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
};
