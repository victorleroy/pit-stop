import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import {
  Box,
  Button,
  Dialog,
  Loader,
  Stack,
  Tag,
  TextField,
  Typography,
} from '@/ui';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {createTeam, fetchTeams, leaveTeam} from '@/api/teams';
import type {Team} from '@/api/types';
import {EmptyState} from '@/components/EmptyState';
import {useToast} from '@/contexts/ToastContext';
import {useAutoFocus} from '@/hooks/useAutoFocus';
import {SURFACE, teamColour} from '@/theme/texture';

const TeamCard = ({
  isBusy,
  onLeave,
  onOpen,
  team,
}: {
  isBusy: boolean;
  onLeave: () => void;
  onOpen: () => void;
  team: Team;
}) => {

  return (
    <Stack
      spacing={2}
      sx={{...SURFACE, flex: '1 1 320px', maxWidth: 420, minWidth: 280, overflow: 'hidden'}}
    >
      <Box sx={{backgroundImage: teamColour(team.name).tint, height: 52}} />

      <Stack spacing={2} sx={{flexGrow: 1, justifyContent: 'space-between', px: 2.5, pb: 2.5}}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} sx={{alignItems: 'center', flexWrap: 'wrap'}}>
            <Typography variant="headingS">{team.name}</Typography>
            {team.isAdmin ? (
              <Tag color="primary" size="small">
                Admin
              </Tag>
            ) : null}
          </Stack>
          <Typography color="textSecondary" variant="textS">
            {team.memberCount} member{team.memberCount > 1 ? 's' : ''}
          </Typography>
        </Stack>

        {team.isMember ? (
          <Stack direction="row" spacing={1}>
            <Button onClick={onOpen} variant="contained">
              Open
            </Button>
            <Button disabled={isBusy} onClick={onLeave} variant="text">
              Leave
            </Button>
          </Stack>
        ) : (
          <Stack spacing={1}>
            <Button onClick={onOpen} variant="outlined">
              Manage
            </Button>
            <Typography color="textSecondary" variant="textXs">
              You administer this team without being in it, so its boards stay closed to you.
            </Typography>
          </Stack>
        )}
      </Stack>
    </Stack>
  );
};

export const TeamsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const nameInputRef = useAutoFocus(isCreating);
  const toast = useToast();

  const closeDialog = () => {
    setIsCreating(false);
    setName('');
  };

  const {data: teams, isLoading} = useQuery({queryFn: fetchTeams, queryKey: ['teams']});

  const invalidate = () => queryClient.invalidateQueries({queryKey: ['teams']});

  const onFailure = (cause: Error) => toast.error(cause.message);

  const createMutation = useMutation({
    mutationFn: createTeam,
    onError: onFailure,
    onSuccess: (team) => {
      closeDialog();
      toast.success(`${team.name} is ready. You administer it.`);
      void invalidate();
    },
  });
  const leaveMutation = useMutation({
    mutationFn: leaveTeam,
    onError: onFailure,
    onSuccess: invalidate,
  });

  const mutations = [createMutation, leaveMutation];
  const isBusy = mutations.some(({isPending}) => isPending);

  const mine = (teams ?? []).filter(({isMember}) => isMember);
  const others = (teams ?? []).filter(({isMember}) => !isMember);

  const cardProps = (team: Team) => ({
    isBusy,
    onLeave: () => leaveMutation.mutate(team.id),
    onOpen: () => navigate(`/teams/${team.id}`),
    team,
  });

  return (
    <Stack spacing={4}>
      <Stack direction="row" sx={{justifyContent: 'flex-end'}}>
        <Button onClick={() => setIsCreating(true)} variant="contained">
          Create a team
        </Button>
      </Stack>

      <Dialog onClose={closeDialog} open={isCreating} size="small">
        <DialogTitle>Create a team</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{pt: 1}}>
            <TextField
              fullWidth
              inputRef={nameInputRef}
              label="Team name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !name.trim()) return;

                event.preventDefault();
                createMutation.mutate(name.trim());
              }}
              placeholder="Mozza"
              size="small"
              value={name}
            />
            <Typography color="textSecondary" variant="textXs">
              You become its administrator: you start the retrospectives, add the members and
              name other administrators.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} variant="text">
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || isBusy}
            onClick={() => createMutation.mutate(name.trim())}
            variant="contained"
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {isLoading ? (
        <Stack sx={{alignItems: 'center', py: 6}}>
          <Loader />
        </Stack>
      ) : null}

      <Stack spacing={2}>
        <Typography variant="headingS">
          Your teams <Typography component="span" color="textSecondary" variant="textS">
            {mine.length}
          </Typography>
        </Typography>

        {mine.length === 0 && !isLoading ? (
          <Typography color="textSecondary" variant="textS">
            You are not in any team yet. A team administrator adds you, or you create your own.
          </Typography>
        ) : null}

        <Stack direction="row" spacing={2} sx={{alignItems: 'stretch', flexWrap: 'wrap'}}>
          {mine.map((team) => (
            <TeamCard key={team.id} {...cardProps(team)} />
          ))}
        </Stack>
      </Stack>

      {others.length > 0 ? (
        <Stack spacing={2}>
          <Stack spacing={0.5}>
            <Typography variant="headingS">
              Teams you administer <Typography component="span" color="textSecondary" variant="textS">
                {others.length}
              </Typography>
            </Typography>
            <Typography color="textSecondary" variant="textS">
              You see them because you administer the organisation. Their retrospectives are
              readable by their members only.
            </Typography>
          </Stack>

          <Stack direction="row" spacing={2} sx={{alignItems: 'stretch', flexWrap: 'wrap'}}>
            {others.map((team) => (
              <TeamCard key={team.id} {...cardProps(team)} />
            ))}
          </Stack>
        </Stack>
      ) : null}

      {!isLoading && (teams ?? []).length === 0 ? (
        <EmptyState
          message="Create the first one. You will administer it and choose who joins."
          title="No team you can see yet"
        />
      ) : null}
    </Stack>
  );
};
