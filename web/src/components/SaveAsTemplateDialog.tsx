import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import {Alert, Button, Dialog, Stack, TextField} from '@/ui';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {fetchTeamTemplates, saveRetroAsTemplate, teamTemplatesKey} from '@/api/templates';
import type {Board, Template} from '@/api/types';
import {useToast} from '@/contexts/ToastContext';

const NAME_MAX_LENGTH = 60;
const DESCRIPTION_MAX_LENGTH = 200;

// Same suffixes as a server-side duplicate, so the prefilled name does not hit the 409.
const freeName = (base: string, team: Template[]) => {
  const taken = new Set(team.map(({name}) => name.trim().toLowerCase()));

  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? '' : index === 2 ? ' (copy)' : ` (copy ${index - 1})`;
    const name = `${base.slice(0, NAME_MAX_LENGTH - suffix.length).trim()}${suffix}`;

    if (!taken.has(name.toLowerCase())) return name;
  }
};

export const SaveAsTemplateDialog = ({
  board,
  onClose,
  open,
}: {
  board: Board;
  onClose: () => void;
  open: boolean;
}) => {
  const [typedName, setName] = useState<string>();
  const {data: templates} = useQuery({
    enabled: open,
    queryFn: () => fetchTeamTemplates(board.teamId),
    queryKey: teamTemplatesKey(board.teamId),
  });
  const name = typedName ?? freeName(board.template?.name ?? board.title, templates?.team ?? []);
  const [description, setDescription] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: () =>
      saveRetroAsTemplate(board.id, {
        description: description.trim() || null,
        name: name.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({queryKey: teamTemplatesKey(board.teamId)});
      toast.success('Template saved', {
        label: 'View templates',
        onClick: () => navigate(`/teams/${board.teamId}/templates`),
      });
      close();
    },
  });

  const close = () => {
    mutation.reset();
    onClose();
  };

  const submit = () => {
    if (!name.trim() || mutation.isPending) return;

    mutation.mutate();
  };

  return (
    <Dialog onClose={close} open={open} size="small">
      <DialogTitle>Save as template</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{pt: 1}}>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;

              event.preventDefault();
              submit();
            }}
            size="small"
            slotProps={{htmlInput: {maxLength: NAME_MAX_LENGTH}}}
            value={name}
          />
          <TextField
            fullWidth
            label="Description"
            multiline
            onChange={(event) => setDescription(event.target.value)}
            size="small"
            slotProps={{htmlInput: {maxLength: DESCRIPTION_MAX_LENGTH}}}
            value={description}
          />
          {mutation.error ? <Alert severity="error">{mutation.error.message}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} variant="text">
          Cancel
        </Button>
        <Button
          disabled={!name.trim() || mutation.isPending}
          onClick={submit}
          variant="contained"
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
