import {
  Alert,
  Avatar,
  Button,
  Loader,
  Select,
  Stack,
  Tag,
  TextField,
  Typography,
} from '@/ui';
import MenuItem from '@mui/material/MenuItem';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {Link, Navigate} from 'react-router-dom';
import {fetchPublicConfig} from '@/api/auth';
import {fetchInvitations, inviteToOrg, revokeInvitation} from '@/api/org';
import {fetchOrgMembers, fetchTeams, setOrgAdmin} from '@/api/teams';
import type {Invitation, OrgMember, OrgRole} from '@/api/types';
import {useAuth} from '@/contexts/AuthContext';
import {useToast} from '@/contexts/ToastContext';
import {TeamDot} from '@/components/TeamDot';
import {SURFACE, teamColour} from '@/theme/texture';
import {initials} from '@/utils/initials';

const MemberRow = ({
  isBusy,
  isLastAdmin,
  member,
  onToggleAdmin,
}: {
  isBusy: boolean;
  isLastAdmin: boolean;
  member: OrgMember;
  onToggleAdmin: () => void;
}) => (
  <Stack
    direction="row"
    spacing={2}
    sx={{alignItems: 'center', borderTop: '1px solid', borderColor: 'divider', flexWrap: 'wrap', py: 2}}
  >
    <Avatar size="small" src={member.pictureUrl}>
      {initials(member.name)}
    </Avatar>

    <Stack spacing={0.25} sx={{minWidth: 180}}>
      <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
        <Typography variant="textM">{member.name}</Typography>
        {member.isOrgAdmin ? (
          <Tag colour="#2F4BF7" size="small">
            Org admin
          </Tag>
        ) : null}
      </Stack>
      <Typography color="textSecondary" variant="textXs">
        {member.email}
      </Typography>
    </Stack>

    <Stack direction="row" spacing={0.75} sx={{flexGrow: 1, flexWrap: 'wrap', rowGap: 0.75}}>
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

    <Button disabled={isBusy || isLastAdmin} onClick={onToggleAdmin} size="small" variant="text">
      {member.isOrgAdmin ? 'Remove' : 'Make admin'}
    </Button>
  </Stack>
);

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

      <Stack direction="row" spacing={1.5} sx={{alignItems: 'center', flexWrap: 'wrap', rowGap: 1.5}}>
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
            sx={{alignItems: 'center', borderTop: '1px solid', borderColor: 'divider', flexWrap: 'wrap', py: 1.5}}
          >
            <Typography sx={{flexGrow: 1}} variant="textM">
              {invitation.email}
            </Typography>
            {invitation.role === 'admin' ? (
              <Tag colour="#2F4BF7" size="small">
                Admin
              </Tag>
            ) : null}
            <Tag colour={STATUS_COLOURS[invitation.status]} size="small">
              {invitation.status}
            </Tag>
            {invitation.status === 'pending' ? (
              <Button
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

  return (
    <Stack spacing={4}>
      {isLoading ? (
        <Stack sx={{alignItems: 'center', py: 6}}>
          <Loader />
        </Stack>
      ) : null}

      <Stack spacing={2} sx={{...SURFACE, p: 3}}>
        <Stack spacing={0.5}>
          <Typography variant="headingS">
            People{' '}
            <Typography color="textSecondary" component="span" variant="textS">
              {members?.length ?? 0}
            </Typography>
          </Typography>
          {admins.length === 1 ? (
            <Typography color="textSecondary" variant="textXs">
              There must be at least one administrator: name somebody else before stepping down.
            </Typography>
          ) : null}
        </Stack>

        <Stack>
          {members?.map((member) => (
            <MemberRow
              isBusy={setAdminMutation.isPending}
              isLastAdmin={member.isOrgAdmin === true && admins.length === 1}
              key={member.id}
              member={member}
              onToggleAdmin={() =>
                setAdminMutation.mutate({isAdmin: !member.isOrgAdmin, userId: member.id})
              }
            />
          ))}
        </Stack>
      </Stack>

      <Invitations />

      <Stack spacing={2} sx={{...SURFACE, p: 3}}>
        <Typography variant="headingS">
          Teams{' '}
          <Typography color="textSecondary" component="span" variant="textS">
            {teams?.length ?? 0}
          </Typography>
        </Typography>

        <Stack direction="row" spacing={1.5} sx={{flexWrap: 'wrap', rowGap: 1.5}}>
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
