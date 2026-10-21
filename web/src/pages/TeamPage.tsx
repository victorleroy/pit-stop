import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import {
  Avatar,
  Button,
  Chip,
  Dialog,
  Loader,
  Select,
  Stack,
  Tag,
  TextField,
  Typography,
} from '@/ui';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {
  createRetro,
  fetchActions,
  fetchRetros,
  removeRetro,
  updateAction,
} from '@/api/retros';
import {
  addTeamMember,
  fetchOrgMembers,
  fetchTeamMembers,
  fetchTeams,
  leaveTeam,
  removeTeamMember,
  setTeamAdmin,
} from '@/api/teams';
import type {ActionStatus, RetroPhase} from '@/api/types';
import {ActionList} from '@/components/ActionList';
import {useAuth} from '@/contexts/AuthContext';
import {useToast} from '@/contexts/ToastContext';
import {useAutoFocus} from '@/hooks/useAutoFocus';
import {TeamDot} from '@/components/TeamDot';
import {SURFACE} from '@/theme/texture';

/**
 * The websocket only ever carries one board. Everything listed around a team, a retro that
 * somebody else just started or an action they ticked off, is picked up by polling instead,
 * so nobody has to reload to see it.
 */
const LIST_POLL_INTERVAL_MS = 10_000;
import {initials} from '@/utils/initials';
import type {ConfirmRequest} from '@/components/ConfirmDialog';
import {ConfirmDialog} from '@/components/ConfirmDialog';

/** Ready-made column sets: teams rarely run the same format twice in a row. */
const TEMPLATES = [
  {columns: ['Start', 'Stop', 'Continue'], label: 'Start / Stop / Continue'},
  {columns: ['Mad', 'Sad', 'Glad'], label: 'Mad / Sad / Glad'},
  {columns: ['Liked', 'Learned', 'Lacked', 'Longed for'], label: '4L'},
  {columns: ['What worked', 'What got stuck', 'Ideas', 'Kudos'], label: 'Wrap-up + kudos'},
];

const PHASE_LABELS: Record<RetroPhase, string> = {
  ARCHIVED: 'Archived',
  BRAINSTORM: 'Brainstorm',
  DISCUSS: 'Discuss',
  SHARE: 'Share',
  VOTE: 'Vote',
};

const SectionTitle = ({count, title}: {count: number; title: string}) => (
  <Typography variant="headingS">
    {title}{' '}
    <Typography color="textSecondary" component="span" variant="textS">
      {count}
    </Typography>
  </Typography>
);

export const TeamPage = () => {
  const {teamId} = useParams<{teamId: string}>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const onFailure = (cause: Error) => toast.error(cause.message);
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState(TEMPLATES[0].label);
  const [isStarting, setIsStarting] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [candidateId, setCandidateId] = useState('');
  const titleInputRef = useAutoFocus(isStarting);
  const {user} = useAuth();
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | undefined>(undefined);

  const closeDialog = () => {
    setIsStarting(false);
    setTitle('');
  };

  const {data: teams} = useQuery({queryFn: fetchTeams, queryKey: ['teams']});
  const {data: members} = useQuery({
    enabled: Boolean(teamId),
    queryFn: () => fetchTeamMembers(teamId as string),
    queryKey: ['teams', teamId, 'members'],
  });
  const team = teams?.find(({id}) => id === teamId);
  const isAdmin = Boolean(team?.isAdmin);
  const isMember = Boolean(team?.isMember);

  // An org admin sees a team they never joined: its boards are not theirs to read, so the
  // lists are not even asked for.
  const {data: retros, error, isLoading} = useQuery({
    enabled: Boolean(teamId) && isMember,
    queryFn: () => fetchRetros(teamId as string),
    queryKey: ['teams', teamId, 'retros'],
    refetchInterval: LIST_POLL_INTERVAL_MS,
  });

  const {data: actions} = useQuery({
    enabled: Boolean(teamId) && isMember,
    queryFn: () => fetchActions(teamId as string),
    queryKey: ['teams', teamId, 'actions'],
    refetchInterval: LIST_POLL_INTERVAL_MS,
  });

  const {data: orgMembers} = useQuery({
    enabled: isAddingMember,
    queryFn: fetchOrgMembers,
    queryKey: ['org', 'members'],
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveTeam(teamId as string),
    onError: onFailure,
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: ['teams']});
      navigate('/teams');
    },
  });

  const removeRetroMutation = useMutation({
    mutationFn: removeRetro,
    onError: onFailure,
    onSuccess: () => queryClient.invalidateQueries({queryKey: ['teams', teamId, 'retros']}),
  });

  const refreshMembers = () => {
    void queryClient.invalidateQueries({queryKey: ['teams', teamId, 'members']});
    void queryClient.invalidateQueries({queryKey: ['teams']});
  };

  const addMemberMutation = useMutation({
    mutationFn: (userId: string) => addTeamMember(teamId as string, userId),
    onError: onFailure,
    onSuccess: () => {
      setIsAddingMember(false);
      setCandidateId('');
      refreshMembers();
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeTeamMember(teamId as string, userId),
    onError: onFailure,
    onSuccess: refreshMembers,
  });

  const setAdminMutation = useMutation({
    mutationFn: ({isAdmin, userId}: {isAdmin: boolean; userId: string}) =>
      setTeamAdmin(teamId as string, userId, isAdmin),
    onError: onFailure,
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: ['teams', teamId, 'members']});
      void queryClient.invalidateQueries({queryKey: ['teams']});
    },
  });

  const updateActionMutation = useMutation({
    mutationFn: ({actionId, status}: {actionId: string; status: ActionStatus}) =>
      updateAction(teamId as string, actionId, {status}),
    onError: onFailure,
    onSuccess: () => queryClient.invalidateQueries({queryKey: ['teams', teamId, 'actions']}),
  });

  const createMutation = useMutation({
    mutationFn: ({columns, retroTitle}: {columns: string[]; retroTitle: string}) =>
      createRetro(teamId as string, retroTitle, columns),
    onError: onFailure,
    onSuccess: (board) => {
      closeDialog();
      void queryClient.invalidateQueries({queryKey: ['teams', teamId, 'retros']});
      navigate(`/teams/${teamId}/retros/${board.id}`);
    },
  });

  // A failed load is reported once, not on every render the query triggers.
  useEffect(() => {
    if (error) toast.error((error as Error).message);
  }, [error]);

  const memberIds = new Set((members ?? []).map(({userId}) => userId));
  const candidates = (orgMembers ?? []).filter(({id}) => !memberIds.has(id));

  const columnsOf = (label: string) =>
    TEMPLATES.find((item) => item.label === label)?.columns ?? TEMPLATES[0].columns;

  const start = () => {
    if (!title.trim()) return;

    createMutation.mutate({columns: columnsOf(template), retroTitle: title.trim()});
  };

  return (
    <Stack spacing={4}>
      <ConfirmDialog onClose={() => setConfirmRequest(undefined)} request={confirmRequest} />

      <Stack spacing={1}>
        <Stack direction="row" spacing={2} sx={{alignItems: 'center', flexWrap: 'wrap'}}>
          <Stack direction="row" spacing={1.5} sx={{alignItems: 'center', flexGrow: 1}}>
            <TeamDot name={team?.name ?? 'team'} size={14} />
            <Typography variant="displayS">{team?.name ?? 'Team'}</Typography>
          </Stack>

          {team?.isMember ? (
            <Button
              disabled={leaveMutation.isPending}
              onClick={() =>
                setConfirmRequest({
                  confirmLabel: 'Leave',
                  message: `You will not see the retrospectives of ${team?.name} any more until you join the team again.`,
                  onConfirm: () => leaveMutation.mutate(),
                  title: 'Leave the team?',
                })
              }
              variant="text"
            >
              Leave the team
            </Button>
          ) : null}

          {isAdmin ? (
            <Button onClick={() => setIsStarting(true)} variant="contained">
              New retrospective
            </Button>
          ) : null}
        </Stack>

        <Link
          style={{color: 'inherit', textDecoration: 'none', width: 'fit-content'}}
          to="/teams"
        >
          <Typography color="textSecondary" variant="textS">
            ← All teams
          </Typography>
        </Link>
      </Stack>

      <Dialog onClose={closeDialog} open={isStarting} size="small">
        <DialogTitle>New retrospective</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{pt: 1}}>
            <TextField
              fullWidth
              inputRef={titleInputRef}
              label="Title"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;

                event.preventDefault();
                start();
              }}
              placeholder="Sprint 12"
              size="small"
              value={title}
            />
            <Select
              fullWidth
              onChange={(event) => setTemplate(event.target.value as string)}
              size="small"
              value={template}
            >
              {TEMPLATES.map(({label}) => (
                <MenuItem key={label} value={label}>
                  {label}
                </MenuItem>
              ))}
            </Select>
            <Typography color="textSecondary" variant="textXs">
              Columns: {columnsOf(template).join(' · ')}. You can rename them or add more while
              people write.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} variant="text">
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || createMutation.isPending}
            onClick={start}
            variant="contained"
          >
            Start
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        onClose={() => setIsAddingMember(false)}
        open={isAddingMember}
        size="small"
      >
        <DialogTitle>Add a member</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{pt: 1}}>
            <Select
              displayEmpty
              fullWidth
              onChange={(event) => setCandidateId(event.target.value as string)}
              size="small"
              value={candidateId}
            >
              <MenuItem disabled value="">
                Choose somebody
              </MenuItem>
              {candidates.map((candidate) => (
                <MenuItem key={candidate.id} value={candidate.id}>
                  {candidate.name} — {candidate.email}
                </MenuItem>
              ))}
            </Select>
            <Typography color="textSecondary" variant="textXs">
              They will see this team's retrospectives, including the ones already held.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsAddingMember(false)} variant="text">
            Cancel
          </Button>
          <Button
            disabled={!candidateId || addMemberMutation.isPending}
            onClick={() => addMemberMutation.mutate(candidateId)}
            variant="contained"
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>

      {isLoading ? (
        <Stack sx={{alignItems: 'center', py: 6}}>
          <Loader />
        </Stack>
      ) : null}

      {isMember ? null : (
        <Stack spacing={0.5} sx={{...SURFACE, px: 3, py: 2.5}}>
          <Typography variant="headingS">You are not in this team</Typography>
          <Typography color="textSecondary" variant="textS">
            You see it because you administer the organisation. Its retrospectives stay closed
            to you, and only an administrator of the team can let somebody in.
          </Typography>
        </Stack>
      )}

      <Stack spacing={2} sx={{display: isMember ? undefined : 'none'}}>
        <Stack direction="row" spacing={2} sx={{alignItems: 'baseline', flexWrap: 'wrap'}}>
          <SectionTitle count={retros?.length ?? 0} title="Retrospectives" />
          {isAdmin ? null : (
            <Typography color="textSecondary" variant="textXs">
              Team administrators start them.
            </Typography>
          )}
        </Stack>

        <Stack spacing={1.5}>
          {retros?.map((retro) => (
            <Stack
              direction="row"
              key={retro.id}
              spacing={2}
              sx={{
                ...SURFACE,
                '&:hover': {borderColor: 'primary.main'},
                alignItems: 'center',
                flexWrap: 'wrap',
                px: 2.5,
                py: 2,
                transition: 'border-color 120ms ease',
              }}
            >
              <Stack
                onClick={() => navigate(`/teams/${teamId}/retros/${retro.id}`)}
                spacing={0.25}
                sx={{cursor: 'pointer', flexGrow: 1, minWidth: 200}}
              >
                <Typography variant="textL">{retro.title}</Typography>
                <Typography color="textSecondary" variant="textXs">
                  {retro.createdAt ? new Date(retro.createdAt).toLocaleDateString('en-GB') : ''}
                </Typography>
              </Stack>

              {retro.isFacilitator ? (
                <Chip label="You facilitate" size="small" variant="outlined" />
              ) : null}

              <Chip
                color={retro.phase === 'ARCHIVED' ? 'default' : 'primary'}
                label={PHASE_LABELS[retro.phase]}
                size="small"
                variant={retro.phase === 'ARCHIVED' ? 'outlined' : 'filled'}
              />

              {isAdmin ? (
                <Button
                  disabled={removeRetroMutation.isPending}
                  onClick={() =>
                    setConfirmRequest({
                      message: `The notes, groups and votes of ${retro.title} will be lost. The actions already decided are kept.`,
                      onConfirm: () => removeRetroMutation.mutate(retro.id),
                      title: 'Delete the retrospective?',
                    })
                  }
                  size="small"
                  variant="text"
                >
                  Delete
                </Button>
              ) : null}
            </Stack>
          ))}
        </Stack>

        {retros?.length === 0 && !isLoading ? (
          <Typography color="textSecondary" variant="textS">
            No retro for this team yet.
            {isAdmin ? ' Start the first one.' : ''}
          </Typography>
        ) : null}
      </Stack>

      <ActionList
        actions={actions ?? []}
        canCreate={false}
        emptyLabel="No action yet. They get decided during the discussion phase."
        isBusy={updateActionMutation.isPending}
        members={members ?? []}
        onStatusChange={(actionId, status) => updateActionMutation.mutate({actionId, status})}
        title="Actions"
      />

      <Stack spacing={1} sx={{...SURFACE, px: 3, py: 2.5}}>
        <Stack direction="row" spacing={2} sx={{alignItems: 'center', flexWrap: 'wrap'}}>
          <Stack sx={{flexGrow: 1}}>
            <SectionTitle count={members?.length ?? 0} title="Members" />
          </Stack>

          {isAdmin ? (
            <Button onClick={() => setIsAddingMember(true)} size="small" variant="outlined">
              Add a member
            </Button>
          ) : null}
        </Stack>

        <Typography color="textSecondary" variant="textXs">
          A team is private: only its members see its retrospectives, and only an
          administrator of the team adds somebody to it.
        </Typography>

        {members?.map((member) => (
          <Stack
            direction="row"
            key={member.userId}
            spacing={2}
            sx={{
              alignItems: 'center',
              borderColor: 'divider',
              borderTop: '1px solid',
              flexWrap: 'wrap',
              py: 1.5,
            }}
          >
            <Avatar size="small" src={member.pictureUrl}>
              {initials(member.name)}
            </Avatar>

            <Stack spacing={0.25} sx={{flexGrow: 1, minWidth: 180}}>
              <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
                <Typography variant="textM">{member.name}</Typography>
                {member.isAdmin ? (
                  <Tag color="primary" size="small">
                    Admin
                  </Tag>
                ) : null}
              </Stack>
              <Typography color="textSecondary" variant="textXs">
                {member.email}
              </Typography>
            </Stack>

            {isAdmin ? (
              <Stack direction="row" spacing={0.5}>
                <Button
                  disabled={setAdminMutation.isPending}
                  onClick={() =>
                    setAdminMutation.mutate({isAdmin: !member.isAdmin, userId: member.userId})
                  }
                  size="small"
                  variant="text"
                >
                  {member.isAdmin ? 'Remove admin' : 'Make admin'}
                </Button>

                {member.userId === user?.id ? null : (
                  <Button
                    disabled={removeMemberMutation.isPending}
                    onClick={() =>
                      setConfirmRequest({
                        confirmLabel: 'Remove',
                        message: `${member.name} will not see the retrospectives of ${team?.name} any more.`,
                        onConfirm: () => removeMemberMutation.mutate(member.userId),
                        title: 'Remove from the team?',
                      })
                    }
                    size="small"
                    variant="text"
                  >
                    Remove
                  </Button>
                )}
              </Stack>
            ) : null}
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
};
