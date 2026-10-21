import {
  Button,
  Card,
  Chip,
  Select,
  Stack,
  TextField,
  Typography,
} from '@/ui';
import MenuItem from '@mui/material/MenuItem';
import {useState} from 'react';
import type {Action, ActionStatus, TeamMember} from '@/api/types';

const STATUS_LABELS: Record<ActionStatus, string> = {
  DONE: 'Done',
  DROPPED: 'Dropped',
  OPEN: 'Open',
};

const ActionRow = ({
  action,
  canComplete,
  isBusy,
  onStatusChange,
}: {
  action: Action;
  canComplete: boolean;
  isBusy: boolean;
  onStatusChange: (status: ActionStatus) => void;
}) => (
  <Stack direction="row" spacing={2} sx={{alignItems: 'center', flexWrap: 'wrap'}}>
    <Stack spacing={0.5} sx={{flexGrow: 1, minWidth: 220}}>
      <Typography
        sx={{textDecoration: action.status === 'OPEN' ? 'none' : 'line-through'}}
        variant="textM"
      >
        {action.text}
      </Typography>
      <Typography color="textSecondary" variant="textXs">
        {action.retroTitle}
        {action.assignee ? ` · ${action.assignee.name}` : ' · unassigned'}
      </Typography>
    </Stack>

    {!canComplete ? null : action.status === 'OPEN' ? (
      <Stack direction="row" spacing={1}>
        <Button disabled={isBusy} onClick={() => onStatusChange('DONE')} size="small">
          Done
        </Button>
        <Button
          disabled={isBusy}
          onClick={() => onStatusChange('DROPPED')}
          size="small"
          variant="text"
        >
          Drop
        </Button>
      </Stack>
    ) : (
      <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
        <Chip label={STATUS_LABELS[action.status]} size="small" variant="outlined" />
        <Button disabled={isBusy} onClick={() => onStatusChange('OPEN')} size="small" variant="text">
          Reopen
        </Button>
      </Stack>
    )}
  </Stack>
);

export const ActionList = ({
  actions,
  canComplete = true,
  canCreate,
  emptyLabel,
  isBusy,
  members,
  onCreate,
  onStatusChange,
  title,
}: {
  actions: Action[];
  canComplete?: boolean;
  canCreate: boolean;
  emptyLabel: string;
  isBusy: boolean;
  members: TeamMember[];
  onCreate?: (text: string, assigneeId?: string) => void;
  onStatusChange: (actionId: string, status: ActionStatus) => void;
  title: string;
}) => {
  const [text, setText] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  const open = actions.filter(({status}) => status === 'OPEN');
  // Dropped actions are settled too: they are not waiting on anybody any more.
  const closed = actions.filter(({status}) => status !== 'OPEN');

  const section = (label: string, rows: Action[]) =>
    rows.length === 0 ? null : (
      <Stack spacing={1.5}>
        <Typography color="textSecondary" variant="textXs">
          {label} · {rows.length}
        </Typography>

        {rows.map((action) => (
          <ActionRow
            action={action}
            canComplete={canComplete}
            isBusy={isBusy}
            key={action.id}
            onStatusChange={(status) => onStatusChange(action.id, status)}
          />
        ))}
      </Stack>
    );

  const submit = () => {
    const trimmed = text.trim();

    if (!trimmed || !onCreate) return;

    setText('');
    setAssigneeId('');
    onCreate(trimmed, assigneeId || undefined);
  };

  return (
    <Card sx={{p: 3}}>
      <Stack spacing={2}>
        <Typography variant="headingS">{title}</Typography>

        {actions.length === 0 ? (
          <Typography color="textSecondary" variant="textS">
            {emptyLabel}
          </Typography>
        ) : null}

        {section('Left to do', open)}
        {section('Done', closed)}

        {canCreate && onCreate ? (
          <Stack direction="row" spacing={2} sx={{alignItems: 'flex-end', flexWrap: 'wrap'}}>
            <TextField
              label="New action"
              onChange={(event) => setText(event.target.value)}
              placeholder="Split the CI into two jobs"
              size="small"
              sx={{flexGrow: 1, minWidth: 240}}
              value={text}
            />
            <Select
              displayEmpty
              onChange={(event) => setAssigneeId(event.target.value as string)}
              size="small"
              sx={{minWidth: 160}}
              value={assigneeId}
            >
              <MenuItem value="">Nobody</MenuItem>
              {members.map((member) => (
                <MenuItem key={member.userId} value={member.userId}>
                  {member.name}
                </MenuItem>
              ))}
            </Select>
            <Button disabled={!text.trim() || isBusy} onClick={submit} variant="contained">
              Add
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
};
