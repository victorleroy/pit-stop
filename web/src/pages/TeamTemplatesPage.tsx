import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import useMediaQuery from '@mui/material/useMediaQuery';
import {useTheme} from '@mui/material/styles';
import {Alert, Button, Chip, Dialog, IconButton, Loader, Select, Stack, TextField, Typography} from '@/ui';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useRef, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {ApiError} from '@/api/client';
import {VOTE_OPTIONS} from '@/api/retros';
import {fetchTeams} from '@/api/teams';
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  fetchTeamTemplates,
  MAX_TEAM_TEMPLATES,
  MAX_TEMPLATE_COLUMNS,
  setDefaultTemplate,
  teamTemplatesKey,
  updateTemplate,
} from '@/api/templates';
import type {Template, TemplateInput} from '@/api/types';
import type {ConfirmRequest} from '@/components/ConfirmDialog';
import {ConfirmDialog} from '@/components/ConfirmDialog';
import {useToast} from '@/contexts/ToastContext';
import {SURFACE} from '@/theme/texture';

const NOT_SET = '';

const TIMER_MINUTES = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];

const timerLabel = (seconds: number) =>
  seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;

interface DraftColumn {
  key: number;
  prompt: string;
  title: string;
}

type StepChoice = 'off' | 'on' | typeof NOT_SET;

const toChoice = (value?: boolean | null): StepChoice =>
  value === true ? 'on' : value === false ? 'off' : NOT_SET;

const fromChoice = (choice: StepChoice) => (choice === NOT_SET ? null : choice === 'on');

const STEP_CHOICES: {label: string; value: StepChoice}[] = [
  {label: 'Not set', value: NOT_SET},
  {label: 'On', value: 'on'},
  {label: 'Off', value: 'off'},
];

const StepControl = ({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (choice: StepChoice) => void;
  value: StepChoice;
}) => (
  <Stack direction="row" sx={{alignItems: 'center', justifyContent: 'space-between'}}>
    <Typography variant="textS">{label}</Typography>
    <ToggleButtonGroup
      aria-label={label}
      exclusive
      onChange={(_event, next: StepChoice | null) => {
        if (next !== null) onChange(next);
      }}
      size="small"
      value={value}
    >
      {STEP_CHOICES.map((choice) => (
        <ToggleButton
          key={choice.label}
          sx={{px: 1.5, py: 0.25, textTransform: 'none'}}
          value={choice.value}
        >
          {choice.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  </Stack>
);

const TemplateEditor = ({
  onClose,
  teamId,
  template,
}: {
  onClose: () => void;
  teamId: string;
  template?: Template;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isMobile = useMediaQuery(useTheme().breakpoints.down('sm'));
  const nextKey = useRef(0);
  const newKey = () => nextKey.current++;
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [columns, setColumns] = useState<DraftColumn[]>(() =>
    (template?.columns ?? []).map((column) => ({
      key: newKey(),
      prompt: column.prompt ?? '',
      title: column.title,
    })),
  );
  const [maxVotes, setMaxVotes] = useState<number | typeof NOT_SET>(template?.maxVotes ?? NOT_SET);
  const [timerSeconds, setTimerSeconds] = useState<number | typeof NOT_SET>(
    template?.timerSeconds ?? NOT_SET,
  );
  const [icebreaker, setIcebreaker] = useState<StepChoice>(toChoice(template?.icebreaker));
  const [actionReview, setActionReview] = useState<StepChoice>(toChoice(template?.actionReview));
  const [error, setError] = useState<string>();

  const timerOptions = [
    ...new Set([...TIMER_MINUTES.map((minutes) => minutes * 60), template?.timerSeconds ?? 60]),
  ].sort((left, right) => left - right);

  const saveMutation = useMutation({
    mutationFn: () => {
      const input: TemplateInput = {
        actionReview: fromChoice(actionReview),
        columns: columns.map(({prompt, title}) => ({
          prompt: prompt.trim() || null,
          title: title.trim(),
        })),
        description: description.trim() || null,
        icebreaker: fromChoice(icebreaker),
        maxVotes: maxVotes === NOT_SET ? null : maxVotes,
        name: name.trim(),
        timerSeconds: timerSeconds === NOT_SET ? null : timerSeconds,
      };

      return template
        ? updateTemplate(teamId, template.id, input)
        : createTemplate(teamId, input);
    },
    onError: (cause: Error) => {
      if (cause instanceof ApiError && cause.status === 403) {
        toast.error(cause.message);
        onClose();

        return;
      }

      setError(cause.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: teamTemplatesKey(teamId)});
      toast.success(template ? 'Template saved.' : 'Template created.');
      onClose();
    },
  });

  const updateColumn = (key: number, changes: Partial<DraftColumn>) =>
    setColumns((current) =>
      current.map((column) => (column.key === key ? {...column, ...changes} : column)),
    );

  const move = (index: number, offset: number) =>
    setColumns((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];

      return next;
    });

  const canSave =
    name.trim().length > 0 && columns.every(({title}) => title.trim().length > 0);

  return (
    <Dialog fullScreen={isMobile} onClose={onClose} open size="medium">
      <DialogTitle>{template ? 'Edit template' : 'New template'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{pt: 1}}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            fullWidth
            helperText={`${name.length}/60`}
            label="Name"
            onChange={(event) => setName(event.target.value)}
            size="small"
            slotProps={{htmlInput: {maxLength: 60}}}
            value={name}
          />
          <TextField
            fullWidth
            helperText={`${description.length}/200`}
            label="Description"
            minRows={2}
            multiline
            onChange={(event) => setDescription(event.target.value)}
            size="small"
            slotProps={{htmlInput: {maxLength: 200}}}
            value={description}
          />

          <Stack spacing={1.5}>
            <Typography variant="headingS">Columns</Typography>
            {columns.length === 0 ? (
              <Typography color="textSecondary" variant="textS">
                No column: the retro starts blank and you add them on the board.
              </Typography>
            ) : null}
            {columns.map((column, index) => (
              <Stack
                direction="row"
                key={column.key}
                spacing={1}
                sx={{...SURFACE, alignItems: 'flex-start', p: 1.5}}
              >
                <Stack spacing={1.5} sx={{flex: 1, minWidth: 0}}>
                  <TextField
                    fullWidth
                    helperText={`${column.title.length}/40`}
                    label={`Title of column ${index + 1}`}
                    onChange={(event) => updateColumn(column.key, {title: event.target.value})}
                    size="small"
                    slotProps={{htmlInput: {maxLength: 40}}}
                    value={column.title}
                  />
                  <TextField
                    fullWidth
                    helperText={`${column.prompt.length}/140`}
                    label={`Prompt of column ${index + 1}`}
                    onChange={(event) => updateColumn(column.key, {prompt: event.target.value})}
                    size="small"
                    slotProps={{htmlInput: {maxLength: 140}}}
                    value={column.prompt}
                  />
                </Stack>
                <Stack>
                  <IconButton
                    aria-label={`Move column ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    size="small"
                  >
                    <ArrowUpwardIcon fontSize="inherit" />
                  </IconButton>
                  <IconButton
                    aria-label={`Move column ${index + 1} down`}
                    disabled={index === columns.length - 1}
                    onClick={() => move(index, 1)}
                    size="small"
                  >
                    <ArrowDownwardIcon fontSize="inherit" />
                  </IconButton>
                  <IconButton
                    aria-label={`Remove column ${index + 1}`}
                    onClick={() =>
                      setColumns((current) => current.filter(({key}) => key !== column.key))
                    }
                    size="small"
                  >
                    <DeleteOutlineIcon fontSize="inherit" />
                  </IconButton>
                </Stack>
              </Stack>
            ))}
            <Stack direction="row" spacing={1.5} sx={{alignItems: 'center'}}>
              <Button
                disabled={columns.length >= MAX_TEMPLATE_COLUMNS}
                onClick={() =>
                  setColumns((current) => [...current, {key: newKey(), prompt: '', title: ''}])
                }
                size="small"
                variant="outlined"
              >
                Add column
              </Button>
              {columns.length >= MAX_TEMPLATE_COLUMNS ? (
                <Typography color="textSecondary" variant="textXs">
                  A template holds at most {MAX_TEMPLATE_COLUMNS} columns.
                </Typography>
              ) : null}
            </Stack>
          </Stack>

          <Stack spacing={0.75}>
            <Typography variant="textS">Votes per person</Typography>
            <Select
              fullWidth
              displayEmpty
              inputProps={{'aria-label': 'Votes per person'}}
              onChange={(event) => setMaxVotes(event.target.value as number | typeof NOT_SET)}
              size="small"
              value={maxVotes}
            >
              <MenuItem value={NOT_SET}>Not set</MenuItem>
              {VOTE_OPTIONS.map((count) => (
                <MenuItem key={count} value={count}>
                  {count} vote{count > 1 ? 's' : ''}
                </MenuItem>
              ))}
            </Select>
          </Stack>

          <Stack spacing={0.75}>
            <Typography variant="textS">Suggested timer</Typography>
            <Select
              fullWidth
              displayEmpty
              inputProps={{'aria-label': 'Suggested timer'}}
              onChange={(event) => setTimerSeconds(event.target.value as number | typeof NOT_SET)}
              size="small"
              value={timerSeconds}
            >
              <MenuItem value={NOT_SET}>Not set</MenuItem>
              {timerOptions.map((seconds) => (
                <MenuItem key={seconds} value={seconds}>
                  {timerLabel(seconds)}
                </MenuItem>
              ))}
            </Select>
          </Stack>

          <Stack spacing={0.75}>
            <StepControl label="Icebreaker" onChange={setIcebreaker} value={icebreaker} />
            <StepControl label="Action review" onChange={setActionReview} value={actionReview} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="text">
          Cancel
        </Button>
        <Button
          disabled={!canSave || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          variant="contained"
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const DuplicateDialog = ({
  onClose,
  onConfirm,
  sourceName,
  targets,
  teamId,
}: {
  onClose: () => void;
  onConfirm: (targetTeamId: string) => void;
  sourceName: string;
  targets: {id: string; name: string}[];
  teamId: string;
}) => {
  const [target, setTarget] = useState(targets.some(({id}) => id === teamId) ? teamId : targets[0].id);

  return (
    <Dialog onClose={onClose} open size="small">
      <DialogTitle>Duplicate {sourceName}</DialogTitle>
      <DialogContent>
        <Stack spacing={0.75} sx={{pt: 1}}>
          <Typography variant="textS">Target team</Typography>
          <Select
            fullWidth
            inputProps={{'aria-label': 'Target team'}}
            onChange={(event) => setTarget(event.target.value as string)}
            size="small"
            value={target}
          >
            {targets.map(({id, name}) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="text">
          Cancel
        </Button>
        <Button onClick={() => onConfirm(target)} variant="contained">
          Duplicate
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export const TeamTemplatesPage = () => {
  const {teamId = ''} = useParams<{teamId: string}>();
  const queryClient = useQueryClient();
  const toast = useToast();
  const onFailure = (cause: Error) => toast.error(cause.message);
  const [editing, setEditing] = useState<{template?: Template}>();
  const [duplicating, setDuplicating] = useState<Template>();
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | undefined>(undefined);

  const {data: teams} = useQuery({queryFn: fetchTeams, queryKey: ['teams']});
  const team = teams?.find(({id}) => id === teamId);
  const adminTeams = (teams ?? []).filter(({isAdmin, isMember}) => isAdmin && isMember);
  const isAdmin = Boolean(team?.isAdmin && team.isMember);

  const {
    data: templates,
    error,
    isLoading,
  } = useQuery({
    queryFn: () => fetchTeamTemplates(teamId),
    queryKey: teamTemplatesKey(teamId),
    retry: false,
  });

  const refresh = (targetTeamId = teamId) =>
    queryClient.invalidateQueries({queryKey: teamTemplatesKey(targetTeamId)});

  const duplicateMutation = useMutation({
    mutationFn: ({sourceId, targetTeamId}: {sourceId: string; targetTeamId: string}) =>
      duplicateTemplate(targetTeamId, sourceId),
    onError: onFailure,
    onSuccess: (copy, {targetTeamId}) => {
      void refresh(targetTeamId);
      toast.success(`${copy.name} created.`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) => deleteTemplate(teamId, templateId),
    onError: onFailure,
    onSuccess: () => void refresh(),
  });

  const defaultMutation = useMutation({
    mutationFn: (templateId: string) => setDefaultTemplate(teamId, templateId),
    onError: onFailure,
    onSuccess: () => {
      void refresh();
      toast.success('Default template updated.');
    },
  });

  const duplicate = (template: Template) => {
    if (adminTeams.length > 1) {
      setDuplicating(template);
    } else {
      duplicateMutation.mutate({sourceId: template.id, targetTeamId: teamId});
    }
  };

  const isNotInTeam =
    (error instanceof ApiError && error.status === 403) || (team && !team.isMember);
  const atLimit = (templates?.team.length ?? 0) >= MAX_TEAM_TEMPLATES;

  const card = (template: Template) => {
    const isDefault = template.id === templates?.defaultTemplateId;
    const isTeamTemplate = template.scope === 'TEAM';

    return (
      <Stack key={template.id} spacing={1} sx={{...SURFACE, px: 2.5, py: 2}}>
        <Stack direction="row" spacing={1} sx={{alignItems: 'center', flexWrap: 'wrap'}} useFlexGap>
          <Typography sx={{overflowWrap: 'anywhere'}} variant="textL">
            {template.name}
          </Typography>
          {isDefault ? <Chip color="primary" label="Default" size="small" /> : null}
        </Stack>
        {template.description ? (
          <Typography color="textSecondary" variant="textS">
            {template.description}
          </Typography>
        ) : null}
        <Typography variant="textXs">
          {template.columns.length === 0
            ? 'No column'
            : template.columns.map(({title}) => title).join(' · ')}
        </Typography>
        {isTeamTemplate && template.updatedBy && template.updatedAt ? (
          <Typography color="textSecondary" variant="textXs">
            Last edited by {template.updatedBy.name},{' '}
            {new Date(template.updatedAt).toLocaleDateString('en-GB')}
          </Typography>
        ) : null}
        {isAdmin ? (
          <Stack direction="row" spacing={1} sx={{flexWrap: 'wrap'}} useFlexGap>
            {isTeamTemplate ? (
              <Button onClick={() => setEditing({template})} size="small" variant="outlined">
                Edit
              </Button>
            ) : null}
            <Button
              disabled={duplicateMutation.isPending || (atLimit && adminTeams.length <= 1)}
              onClick={() => duplicate(template)}
              size="small"
              variant="outlined"
            >
              {isTeamTemplate ? 'Duplicate' : 'Duplicate to team'}
            </Button>
            {isDefault ? null : (
              <Button
                disabled={defaultMutation.isPending}
                onClick={() => defaultMutation.mutate(template.id)}
                size="small"
                variant="outlined"
              >
                Set as default
              </Button>
            )}
            {isTeamTemplate ? (
              <Button
                color="error"
                onClick={() =>
                  setConfirmRequest({
                    message: `Delete "${template.name}"? Retros already created with it are not affected. This cannot be undone.`,
                    onConfirm: () => deleteMutation.mutate(template.id),
                    title: 'Delete the template?',
                  })
                }
                size="small"
                variant="text"
              >
                Delete
              </Button>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    );
  };

  return (
    <Stack spacing={4}>
      <ConfirmDialog onClose={() => setConfirmRequest(undefined)} request={confirmRequest} />

      <Stack spacing={1}>
        <Stack direction="row" spacing={2} sx={{alignItems: 'center', flexWrap: 'wrap'}} useFlexGap>
          <Typography sx={{flexGrow: 1}} variant="displayS">
            Templates{team ? ` · ${team.name}` : ''}
          </Typography>
          {isAdmin && templates ? (
            <Button
              disabled={atLimit}
              onClick={() => setEditing({})}
              variant="contained"
            >
              New template
            </Button>
          ) : null}
        </Stack>
        {isAdmin && atLimit ? (
          <Typography color="textSecondary" variant="textXs">
            A team holds at most {MAX_TEAM_TEMPLATES} templates: delete one to add another.
          </Typography>
        ) : null}
        <Link
          style={{color: 'inherit', textDecoration: 'none', width: 'fit-content'}}
          to={`/teams/${teamId}`}
        >
          <Typography color="textSecondary" variant="textS">
            ← Back to the team
          </Typography>
        </Link>
      </Stack>

      {isLoading ? (
        <Stack sx={{alignItems: 'center', py: 6}}>
          <Loader />
        </Stack>
      ) : null}

      {isNotInTeam ? (
        <Stack spacing={0.5} sx={{...SURFACE, px: 3, py: 2.5}}>
          <Typography variant="headingS">You are not in this team</Typography>
          <Typography color="textSecondary" variant="textS">
            Its templates stay closed to you until an administrator of the team lets you in.
          </Typography>
        </Stack>
      ) : error ? (
        <Alert severity="error">{(error as Error).message}</Alert>
      ) : null}

      {templates ? (
        <>
          <Stack spacing={2}>
            <Typography variant="headingS">Your team</Typography>
            {templates.team.length === 0 ? (
              <Stack spacing={1.5} sx={{alignItems: 'flex-start'}}>
                <Typography color="textSecondary" variant="textS">
                  No team template yet. Duplicate a classic or create your own.
                </Typography>
                {isAdmin ? (
                  <Button onClick={() => setEditing({})} variant="outlined">
                    New template
                  </Button>
                ) : null}
              </Stack>
            ) : (
              <Stack spacing={1.5}>{templates.team.map(card)}</Stack>
            )}
          </Stack>

          <Stack spacing={2}>
            <Typography variant="headingS">Classics</Typography>
            <Stack spacing={1.5}>{templates.builtin.map(card)}</Stack>
          </Stack>
        </>
      ) : null}

      {editing ? (
        <TemplateEditor
          onClose={() => setEditing(undefined)}
          teamId={teamId}
          template={editing.template}
        />
      ) : null}

      {duplicating ? (
        <DuplicateDialog
          onClose={() => setDuplicating(undefined)}
          onConfirm={(targetTeamId) => {
            duplicateMutation.mutate({sourceId: duplicating.id, targetTeamId});
            setDuplicating(undefined);
          }}
          sourceName={duplicating.name}
          targets={adminTeams}
          teamId={teamId}
        />
      ) : null}
    </Stack>
  );
};
