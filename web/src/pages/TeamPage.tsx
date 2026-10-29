import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import Autocomplete, {createFilterOptions} from '@mui/material/Autocomplete';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import {
  Avatar,
  Button,
  Chip,
  Dialog,
  IconButton,
  Loader,
  Select,
  Stack,
  Tag,
  TextField,
  Tooltip,
  Typography,
} from '@/ui';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useRef, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {
  createRetro,
  DEFAULT_MAX_VOTES,
  fetchActions,
  fetchRetros,
  removeRetro,
  updateAction,
  VOTE_OPTIONS,
} from '@/api/retros';
import {
  addTeamMember,
  deleteTeam,
  fetchOrgMembers,
  fetchTeamMembers,
  fetchTeams,
  fetchTeamSummary,
  leaveTeam,
  removeTeamMember,
  renameTeam,
  setTeamAdmin,
} from '@/api/teams';
import type {ActionStatus, OrgMember, RetroPhase, Team, TeamMember} from '@/api/types';
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
  // For a format of its own: the facilitator lays the columns out on the board first.
  {columns: [], label: 'Blank'},
];

// The search matches the e-mail too: two people can share a name, never an address.
const filterCandidates = createFilterOptions<OrgMember>({
  stringify: ({email, name}) => `${name} ${email}`,
});

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

/**
 * Deleting a team takes its retrospectives and actions with it, so the dialog says how many
 * and asks for the name typed out: a click alone is too easy to make on the wrong team.
 */
const DeleteTeamDialog = ({onClose, open, team}: {onClose: () => void; open: boolean; team: Team}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmation, setConfirmation] = useState('');

  const {data: summary} = useQuery({
    enabled: open,
    queryFn: () => fetchTeamSummary(team.id),
    queryKey: ['teams', team.id, 'summary'],
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTeam(team.id),
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: ['teams']});
      // Its retros leave the personal list, and the org counters and member teams move too.
      void queryClient.invalidateQueries({queryKey: ['me', 'retros']});
      void queryClient.invalidateQueries({queryKey: ['org', 'stats']});
      void queryClient.invalidateQueries({queryKey: ['org', 'members']});
      toast.success(`${team.name} has been deleted.`);
      navigate('/teams');
    },
  });

  const close = () => {
    setConfirmation('');
    onClose();
  };

  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

  return (
    <Dialog onClose={close} open={open} size="small">
      <DialogTitle>Delete {team.name}?</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{pt: 1}}>
          <Typography variant="textM">
            {summary
              ? `${plural(summary.retroCount, 'retrospective')} and ${plural(summary.actionCount, 'action')} will be permanently deleted, along with the memberships of the team.`
              : 'Its retrospectives, actions and memberships will be permanently deleted.'}{' '}
            This cannot be undone.
          </Typography>
          <TextField
            fullWidth
            label={`Type ${team.name} to confirm`}
            onChange={(event) => setConfirmation(event.target.value)}
            size="small"
            value={confirmation}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} variant="text">
          Cancel
        </Button>
        <Button
          color="error"
          disabled={confirmation !== team.name || deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
          variant="contained"
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export const TeamPage = () => {
  const {teamId} = useParams<{teamId: string}>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const onFailure = (cause: Error) => toast.error(cause.message);
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState(TEMPLATES[0].label);
  const [isStarting, setIsStarting] = useState(false);
  const [maxVotes, setMaxVotes] = useState(DEFAULT_MAX_VOTES);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<OrgMember[]>([]);
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const titleInputRef = useAutoFocus(isStarting);
  const nameInputRef = useAutoFocus(isRenaming);
  const cancelledRenameRef = useRef(false);
  const {user} = useAuth();
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | undefined>(undefined);
  const [memberMenu, setMemberMenu] = useState<
    {anchor: HTMLElement; member: TeamMember} | undefined
  >(undefined);
  const [isMemberMenuOpen, setIsMemberMenuOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const closeDialog = () => {
    setIsStarting(false);
    setTitle('');
  };

  const closeMemberDialog = () => {
    setIsAddingMember(false);
    setSelectedCandidates([]);
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

  // One request per person, one after the other: if one fails, the ones before it are
  // already in and the refresh shows exactly who made it.
  const addMembersMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      for (const userId of userIds) {
        await addTeamMember(teamId as string, userId);
      }

      return userIds.length;
    },
    onError: (cause: Error) => {
      refreshMembers();
      onFailure(cause);
    },
    onSuccess: (count) => {
      closeMemberDialog();
      refreshMembers();
      toast.success(count > 1 ? `${count} members added.` : '1 member added.');
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => renameTeam(teamId as string, name),
    onError: onFailure,
    onSuccess: (renamed) => {
      void queryClient.invalidateQueries({queryKey: ['teams']});
      toast.success(`The team is now called ${renamed.name}.`);
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
    mutationFn: ({
      columns,
      retroMaxVotes,
      retroTitle,
    }: {
      columns: string[];
      retroMaxVotes: number;
      retroTitle: string;
    }) => createRetro(teamId as string, retroTitle, columns, retroMaxVotes),
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

  // Only an unknown label falls back to the default set: the empty columns of Blank are a
  // choice, sent as such.
  const columnsOf = (label: string) =>
    TEMPLATES.find((item) => item.label === label)?.columns ?? TEMPLATES[0].columns;

  const start = () => {
    if (!title.trim()) return;

    createMutation.mutate({
      columns: columnsOf(template),
      retroMaxVotes: maxVotes,
      retroTitle: title.trim(),
    });
  };

  const startRenaming = () => {
    cancelledRenameRef.current = false;
    setNameDraft(team?.name ?? '');
    setIsRenaming(true);
  };

  const saveName = () => {
    const name = nameDraft.trim();
    setIsRenaming(false);

    // An Escape already closed the field: the blur that follows has nothing to save.
    if (cancelledRenameRef.current) return;

    if (name && name !== team?.name) {
      renameMutation.mutate(name);
    }
  };

  return (
    <Stack spacing={4}>
      <ConfirmDialog onClose={() => setConfirmRequest(undefined)} request={confirmRequest} />

      <Stack spacing={1}>
        <Stack
          direction="row"
          spacing={2}
          sx={{alignItems: 'center', flexWrap: 'wrap'}}
          useFlexGap
        >
          <Stack
            direction="row"
            spacing={1.5}
            sx={{alignItems: 'center', flexGrow: 1, minWidth: 0}}
          >
            <TeamDot name={team?.name ?? 'team'} size={14} />
            {isRenaming ? (
              <TextField
                inputRef={nameInputRef}
                onBlur={saveName}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter saves through the blur, so the name is never sent twice.
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    (event.target as HTMLInputElement).blur();
                  }

                  if (event.key === 'Escape') {
                    // Flagged before anything else: the blur that follows closes over the
                    // draft as typed, so resetting it alone would not stop the save.
                    cancelledRenameRef.current = true;
                    setNameDraft(team?.name ?? '');
                    setIsRenaming(false);
                  }
                }}
                size="small"
                slotProps={{htmlInput: {'aria-label': 'Team name', maxLength: 60}}}
                sx={{flexGrow: 1, maxWidth: 420}}
                value={nameDraft}
              />
            ) : (
              <>
                <Typography sx={{overflowWrap: 'anywhere'}} variant="displayS">
                  {team?.name ?? 'Team'}
                </Typography>
                {isAdmin ? (
                  <Tooltip title="Rename the team">
                    {/* A disabled button fires no events: the span keeps the tooltip working. */}
                    <span>
                      <IconButton
                        aria-label="Rename the team"
                        disabled={renameMutation.isPending}
                        onClick={startRenaming}
                        size="small"
                      >
                        <EditOutlinedIcon fontSize="inherit" />
                      </IconButton>
                    </span>
                  </Tooltip>
                ) : null}
              </>
            )}
          </Stack>

          {team?.isMember ? (
            <Button
              color="error"
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
            <Stack spacing={0.75}>
              <Select
                fullWidth
                inputProps={{'aria-label': 'Template'}}
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
                {columnsOf(template).length === 0
                  ? 'No column yet: you add them on the board before people write.'
                  : `Columns: ${columnsOf(template).join(' · ')}. You can rename them or add more while people write.`}
              </Typography>
            </Stack>
            <Stack spacing={0.75}>
              <Typography variant="textS">Votes per person</Typography>
              <Select
                fullWidth
                inputProps={{'aria-label': 'Votes per person'}}
                onChange={(event) => setMaxVotes(Number(event.target.value))}
                size="small"
                value={maxVotes}
              >
                {VOTE_OPTIONS.map((count) => (
                  <MenuItem key={count} value={count}>
                    {count} vote{count > 1 ? 's' : ''}
                  </MenuItem>
                ))}
              </Select>
              <Typography color="textSecondary" variant="textXs">
                Fewer votes force a choice and keep the discussion on what matters most.
              </Typography>
            </Stack>
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

      <Dialog onClose={closeMemberDialog} open={isAddingMember} size="small">
        <DialogTitle>Add members</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{pt: 1}}>
            <Autocomplete
              disableCloseOnSelect
              filterOptions={filterCandidates}
              filterSelectedOptions
              getOptionLabel={(candidate) => candidate.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              loading={!orgMembers}
              multiple
              noOptionsText="Nobody matches"
              onChange={(_event, value) => setSelectedCandidates(value)}
              options={candidates}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="People"
                  placeholder={selectedCandidates.length === 0 ? 'Search a name or an e-mail' : ''}
                />
              )}
              renderOption={({key, ...props}, candidate) => (
                <Stack
                  component="li"
                  direction="row"
                  key={key}
                  spacing={1.5}
                  {...props}
                  sx={{alignItems: 'center'}}
                >
                  <Avatar size="small" src={candidate.pictureUrl}>
                    {initials(candidate.name)}
                  </Avatar>
                  <Stack sx={{minWidth: 0}}>
                    <Typography variant="textM">{candidate.name}</Typography>
                    <Typography color="textSecondary" noWrap variant="textXs">
                      {candidate.email}
                    </Typography>
                  </Stack>
                </Stack>
              )}
              size="small"
              value={selectedCandidates}
            />
            <Typography color="textSecondary" variant="textXs">
              {orgMembers && candidates.length === 0
                ? 'Everybody in the organisation is already in this team.'
                : "They will see this team's retrospectives, including the ones already held."}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeMemberDialog} variant="text">
            Cancel
          </Button>
          <Button
            disabled={selectedCandidates.length === 0 || addMembersMutation.isPending}
            onClick={() => addMembersMutation.mutate(selectedCandidates.map(({id}) => id))}
            variant="contained"
          >
            {selectedCandidates.length > 1 ? `Add ${selectedCandidates.length}` : 'Add'}
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
        <Stack
          direction="row"
          spacing={2}
          sx={{alignItems: 'baseline', flexWrap: 'wrap'}}
          useFlexGap
        >
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
              useFlexGap
            >
              <Stack
                component={Link}
                spacing={0.25}
                sx={{color: 'inherit', flex: '1 1 200px', minWidth: 0, textDecoration: 'none'}}
                to={`/teams/${teamId}/retros/${retro.id}`}
              >
                <Typography variant="textL">{retro.title}</Typography>
                <Typography color="textSecondary" variant="textXs">
                  {retro.createdAt ? new Date(retro.createdAt).toLocaleDateString('en-GB') : ''}
                </Typography>
              </Stack>

              {/* The badges and the delete travel together: a long title wraps, they do not split. */}
              <Stack direction="row" spacing={1} sx={{alignItems: 'center', flexShrink: 0}} useFlexGap>
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
                    color="error"
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
        <Stack
          direction="row"
          spacing={2}
          sx={{alignItems: 'center', flexWrap: 'wrap'}}
          useFlexGap
        >
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

        <Stack spacing={0.25}>
          {members?.map((member) => (
            <Stack
              direction="row"
              key={member.userId}
              spacing={1.5}
              sx={{
                '&:hover': {bgcolor: 'action.hover'},
                alignItems: 'center',
                borderRadius: '10px',
                mx: -1.25,
                px: 1.25,
                py: 1.25,
                transition: 'background-color 120ms ease',
              }}
            >
              <Avatar size="small" src={member.pictureUrl}>
                {initials(member.name)}
              </Avatar>

              <Stack sx={{flexGrow: 1, minWidth: 0}}>
                <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
                  <Typography noWrap variant="textM">
                    {member.name}
                  </Typography>
                  {member.isAdmin ? (
                    <Tag color="primary" size="small">
                      Admin
                    </Tag>
                  ) : null}
                </Stack>
                <Typography color="textSecondary" noWrap variant="textXs">
                  {member.email}
                </Typography>
              </Stack>

              {isAdmin ? (
                <IconButton
                  aria-label={`Actions for ${member.name}`}
                  onClick={(event) => {
                    setMemberMenu({anchor: event.currentTarget, member});
                    setIsMemberMenuOpen(true);
                  }}
                  size="small"
                >
                  <MoreHorizIcon fontSize="small" />
                </IconButton>
              ) : null}
            </Stack>
          ))}
        </Stack>

        <Menu
          anchorEl={memberMenu?.anchor}
          anchorOrigin={{horizontal: 'right', vertical: 'bottom'}}
          onClose={() => setIsMemberMenuOpen(false)}
          open={isMemberMenuOpen}
          transformOrigin={{horizontal: 'right', vertical: 'top'}}
        >
          <MenuItem
            disabled={setAdminMutation.isPending}
            onClick={() => {
              if (memberMenu) {
                const {member} = memberMenu;
                setAdminMutation.mutate({isAdmin: !member.isAdmin, userId: member.userId});
              }
              setIsMemberMenuOpen(false);
            }}
          >
            {memberMenu?.member.isAdmin ? 'Remove team admin' : 'Make team admin'}
          </MenuItem>

          {/* Nobody removes themselves: leaving the team is its own button, with its own words. */}
          {memberMenu && memberMenu.member.userId !== user?.id ? (
            <MenuItem
              disabled={removeMemberMutation.isPending}
              onClick={() => {
                const {member} = memberMenu;
                setIsMemberMenuOpen(false);
                setConfirmRequest({
                  confirmLabel: 'Remove',
                  message: `${member.name} will not see the retrospectives of ${team?.name} any more.`,
                  onConfirm: () => removeMemberMutation.mutate(member.userId),
                  title: 'Remove from the team?',
                });
              }}
              sx={{color: 'error.main'}}
            >
              Remove from the team
            </MenuItem>
          ) : null}
        </Menu>
      </Stack>

      {/* An org admin manages every team of the organisation, joined or not, so the way to
          delete one is theirs alone and does not depend on membership. */}
      {user?.isOrgAdmin && team ? (
        <Stack
          direction="row"
          spacing={2}
          sx={{
            ...SURFACE,
            alignItems: 'center',
            borderColor: 'rgba(223, 27, 65, 0.35)',
            flexWrap: 'wrap',
            px: 3,
            py: 2.5,
          }}
          useFlexGap
        >
          <Stack spacing={0.5} sx={{flexGrow: 1, minWidth: 220}}>
            <Typography variant="headingS">Delete this team</Typography>
            <Typography color="textSecondary" variant="textS">
              Its retrospectives, actions and memberships are deleted with it, for good. There is
              no way to bring them back.
            </Typography>
          </Stack>
          <Button color="error" onClick={() => setIsDeleting(true)} variant="outlined">
            Delete the team
          </Button>
          <DeleteTeamDialog onClose={() => setIsDeleting(false)} open={isDeleting} team={team} />
        </Stack>
      ) : null}
    </Stack>
  );
};
