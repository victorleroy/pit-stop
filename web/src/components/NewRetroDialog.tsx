import Autocomplete, {createFilterOptions} from '@mui/material/Autocomplete';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import useMediaQuery from '@mui/material/useMediaQuery';
import {useTheme} from '@mui/material/styles';
import {Button, Chip, Dialog, Select, Stack, TextField, Typography} from '@/ui';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {ApiError} from '@/api/client';
import {createRetro, DEFAULT_MAX_VOTES, VOTE_OPTIONS} from '@/api/retros';
import {fetchTeams} from '@/api/teams';
import {fetchTeamTemplates, teamTemplatesKey} from '@/api/templates';
import type {Template} from '@/api/types';
import {useToast} from '@/contexts/ToastContext';
import {useAutoFocus} from '@/hooks/useAutoFocus';

const filterTemplates = createFilterOptions<Template>({
  stringify: (template) => [template.name, ...template.columns.map(({title}) => title)].join(' '),
});

export const NewRetroDialog = ({
  initialTeamId,
  onClose,
  teamIds,
}: {
  initialTeamId?: string;
  onClose: () => void;
  teamIds: string[];
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const isMobile = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [title, setTitle] = useState('');
  const [teamId, setTeamId] = useState(initialTeamId ?? teamIds[0]);
  const [pickedId, setPickedId] = useState<string>();
  const [votesPicked, setVotesPicked] = useState<number>();
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  const [icebreakerPicked, setIcebreakerPicked] = useState<boolean>();
  const [actionReviewPicked, setActionReviewPicked] = useState<boolean>();
  const titleInputRef = useAutoFocus(true);
  const hasSeveralTeams = teamIds.length > 1;

  const {data: teams} = useQuery({
    enabled: hasSeveralTeams,
    queryFn: fetchTeams,
    queryKey: ['teams'],
  });

  const {
    data: templates,
    isError,
    isLoading,
    refetch,
  } = useQuery({queryFn: () => fetchTeamTemplates(teamId), queryKey: teamTemplatesKey(teamId)});

  const all = templates ? [...templates.team, ...templates.builtin] : [];
  const selected =
    all.find(({id}) => id === pickedId) ?? all.find(({id}) => id === templates?.defaultTemplateId);
  const maxVotes = votesPicked ?? selected?.maxVotes ?? DEFAULT_MAX_VOTES;
  const hasIcebreaker = icebreakerPicked ?? selected?.icebreaker ?? true;
  const hasActionReview = actionReviewPicked ?? selected?.actionReview ?? true;

  const createMutation = useMutation({
    mutationFn: () =>
      createRetro(teamId, title.trim(), {
        actionReview: hasActionReview,
        icebreaker: hasIcebreaker,
        maxVotes,
        templateId: (selected as Template).id,
      }),
    onError: (cause: Error) => {
      toast.error(cause.message);

      if (cause instanceof ApiError && cause.status === 404) {
        setPickedId(undefined);
        resetPicks();
        void refetch();
      }
    },
    onSuccess: (board) => {
      onClose();
      void queryClient.invalidateQueries({queryKey: ['teams', teamId, 'retros']});
      void queryClient.invalidateQueries({queryKey: ['me', 'retros']});
      navigate(`/teams/${teamId}/retros/${board.id}`);
    },
  });

  const resetPicks = () => {
    setVotesPicked(undefined);
    setIcebreakerPicked(undefined);
    setActionReviewPicked(undefined);
  };

  const start = () => {
    if (!title.trim() || !selected) return;

    createMutation.mutate();
  };

  const pick = (templateId: string) => {
    setPickedId(templateId);
    resetPicks();
  };

  const changeTeam = (nextTeamId: string) => {
    setTeamId(nextTeamId);
    setPickedId(undefined);
    resetPicks();
  };

  const steps = [hasIcebreaker && 'Icebreaker', hasActionReview && 'Action review'].filter(Boolean);

  const preview = selected ? (
    <Stack aria-live="polite" id="template-preview" spacing={0.75}>
      {selected.description ? (
        <Typography color="textSecondary" variant="textS">
          {selected.description}
        </Typography>
      ) : null}
      {steps.length > 0 ? (
        <Typography color="textSecondary" variant="textXs">
          {steps.join(' · ')}
        </Typography>
      ) : null}
      {selected.columns.length === 0 ? (
        <Typography color="textSecondary" variant="textXs">
          No column yet: you add them on the board before people write.
        </Typography>
      ) : (
        <Stack component="ul" spacing={0.25} sx={{m: 0, pl: 2.5}}>
          {selected.columns.map((column) => (
            <Typography component="li" key={column.title} variant="textXs">
              {column.prompt ? `${column.title}: ${column.prompt}` : column.title}
            </Typography>
          ))}
        </Stack>
      )}
    </Stack>
  ) : null;

  return (
    <Dialog fullScreen={isMobile} onClose={onClose} open size="small">
      <DialogTitle>New retrospective</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{pt: 1}}>
          {hasSeveralTeams ? (
            <Select
              fullWidth
              inputProps={{'aria-label': 'Team'}}
              onChange={(event) => changeTeam(event.target.value as string)}
              size="small"
              value={teamId}
            >
              {teamIds.map((id) => (
                <MenuItem key={id} value={id}>
                  {teams?.find((team) => team.id === id)?.name ?? id}
                </MenuItem>
              ))}
            </Select>
          ) : null}
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
          <Stack spacing={1}>
            {isLoading ? (
              <Skeleton aria-label="Loading templates" height={40} variant="rounded" />
            ) : null}
            {isError ? (
              <Stack direction="row" spacing={1.5} sx={{alignItems: 'center'}}>
                <Typography color="error" variant="textS">
                  Could not load the templates.
                </Typography>
                <Button onClick={() => void refetch()} size="small" variant="outlined">
                  Retry
                </Button>
              </Stack>
            ) : null}
            {templates ? (
              <Autocomplete
                disableClearable={Boolean(selected)}
                filterOptions={filterTemplates}
                getOptionKey={(template) => template.id}
                getOptionLabel={(template) => template.name}
                groupBy={(template) =>
                  templates.team.includes(template) ? 'Your team' : 'Classics'
                }
                isOptionEqualToValue={(option, value) => option.id === value.id}
                noOptionsText="No template matches"
                onChange={(_event, template) => {
                  if (template) pick(template.id);
                }}
                options={all}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    inputProps={{...params.inputProps, 'aria-describedby': 'template-preview'}}
                    label="Template"
                    size="small"
                  />
                )}
                renderOption={({key, ...props}, template) => (
                  <Stack
                    component="li"
                    direction="row"
                    key={key}
                    spacing={1}
                    {...props}
                    sx={{alignItems: 'center'}}
                  >
                    <Typography variant="textM">{template.name}</Typography>
                    {template.id === templates.defaultTemplateId ? (
                      <Chip color="primary" label="Default" size="small" />
                    ) : null}
                  </Stack>
                )}
                size="small"
                value={selected ?? null}
              />
            ) : null}
            {isMobile && preview ? (
              <Button
                onClick={() => setIsPreviewOpen((open) => !open)}
                size="small"
                sx={{alignSelf: 'flex-start'}}
                variant="text"
              >
                {isPreviewOpen ? 'Hide preview' : 'Show preview'}
              </Button>
            ) : null}
            {isMobile && !isPreviewOpen ? null : preview}
            <Typography
              color="primary"
              component={Link}
              onClick={onClose}
              sx={{alignSelf: 'flex-start', textDecoration: 'none'}}
              to={`/teams/${teamId}/templates`}
              variant="textXs"
            >
              Manage templates
            </Typography>
          </Stack>
          <Stack spacing={0.75}>
            <Typography variant="textS">Votes per person</Typography>
            <Select
              fullWidth
              inputProps={{'aria-label': 'Votes per person'}}
              onChange={(event) => setVotesPicked(Number(event.target.value))}
              size="small"
              value={maxVotes}
            >
              {VOTE_OPTIONS.map((count) => (
                <MenuItem key={count} value={count}>
                  {count} vote{count > 1 ? 's' : ''}
                </MenuItem>
              ))}
            </Select>
          </Stack>
          <Stack>
            <FormControlLabel
              control={
                <Checkbox
                  checked={hasIcebreaker}
                  onChange={(event) => setIcebreakerPicked(event.target.checked)}
                  size="small"
                />
              }
              label="Start with an icebreaker"
              sx={{mx: 0}}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={hasActionReview}
                  onChange={(event) => setActionReviewPicked(event.target.checked)}
                  size="small"
                />
              }
              label="Review open actions"
              sx={{mx: 0}}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="text">
          Cancel
        </Button>
        <Button
          disabled={!title.trim() || !selected || createMutation.isPending}
          onClick={start}
          variant="contained"
        >
          Start
        </Button>
      </DialogActions>
    </Dialog>
  );
};
