import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import {Button, Dialog, Select, Stack, TextField, Typography} from '@/ui';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {createRetro, DEFAULT_MAX_VOTES, VOTE_OPTIONS} from '@/api/retros';
import {useToast} from '@/contexts/ToastContext';
import {useAutoFocus} from '@/hooks/useAutoFocus';

/** Ready-made column sets: teams rarely run the same format twice in a row. */
const TEMPLATES = [
  {columns: ['Start', 'Stop', 'Continue'], label: 'Start / Stop / Continue'},
  {columns: ['Mad', 'Sad', 'Glad'], label: 'Mad / Sad / Glad'},
  {columns: ['Liked', 'Learned', 'Lacked', 'Longed for'], label: '4L'},
  {columns: ['What worked', 'What got stuck', 'Ideas', 'Kudos'], label: 'Wrap-up + kudos'},
  // For a format of its own: the facilitator lays the columns out on the board first.
  {columns: [], label: 'Blank'},
];

// Only an unknown label falls back to the default set: the empty columns of Blank are a
// choice, sent as such.
const columnsOf = (label: string) =>
  TEMPLATES.find((item) => item.label === label)?.columns ?? TEMPLATES[0].columns;

export const NewRetroDialog = ({onClose, teamId}: {onClose: () => void; teamId: string}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState(TEMPLATES[0].label);
  const [maxVotes, setMaxVotes] = useState(DEFAULT_MAX_VOTES);
  const titleInputRef = useAutoFocus(true);

  const createMutation = useMutation({
    mutationFn: () => createRetro(teamId, title.trim(), columnsOf(template), maxVotes),
    onError: (cause: Error) => toast.error(cause.message),
    onSuccess: (board) => {
      onClose();
      void queryClient.invalidateQueries({queryKey: ['teams', teamId, 'retros']});
      void queryClient.invalidateQueries({queryKey: ['me', 'retros']});
      navigate(`/teams/${teamId}/retros/${board.id}`);
    },
  });

  const start = () => {
    if (!title.trim()) return;

    createMutation.mutate();
  };

  return (
    <Dialog onClose={onClose} open size="small">
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
        <Button onClick={onClose} variant="text">
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
  );
};
