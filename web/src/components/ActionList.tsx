import {
  Button,
  Chip,
  IconButton,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@/ui';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import MenuItem from '@mui/material/MenuItem';
import {useEffect, useRef, useState} from 'react';
import type {Action, ActionStatus, TeamMember} from '@/api/types';
import {InlineEditor} from '@/components/InlineEditor';

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
  onTextChange,
}: {
  action: Action;
  canComplete: boolean;
  isBusy: boolean;
  onStatusChange: (status: ActionStatus) => void;
  onTextChange?: (text: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Stack direction="row" spacing={2} sx={{alignItems: 'center', flexWrap: 'wrap'}}>
      <Stack spacing={0.5} sx={{flexGrow: 1, minWidth: 220}}>
        {isEditing && onTextChange ? (
          <InlineEditor
            label="Action text"
            maxLength={300}
            onClose={() => setIsEditing(false)}
            onSave={onTextChange}
            value={action.text}
          />
        ) : (
          <Stack direction="row" spacing={0.5} sx={{alignItems: 'center'}}>
            <Typography
              sx={{textDecoration: action.status === 'OPEN' ? 'none' : 'line-through'}}
              variant="textM"
            >
              {action.text}
            </Typography>
            {onTextChange ? (
              <Tooltip title="Edit this action">
                <IconButton
                  aria-label="Edit this action"
                  onClick={() => setIsEditing(true)}
                  size="small"
                >
                  <EditOutlinedIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            ) : null}
          </Stack>
        )}
        <Typography color="textSecondary" variant="textXs">
          {action.retroTitle}
          {action.assignee ? ` · ${action.assignee.name}` : ' · unassigned'}
        </Typography>
      </Stack>

      {!canComplete ? null : action.status === 'OPEN' ? (
        <Stack direction="row" spacing={1}>
          <Tooltip title="Abandon this action, keep it in history">
            <span>
              <Button
                color="error"
                disabled={isBusy}
                onClick={() => onStatusChange('DROPPED')}
                size="small"
                variant="text"
              >
                Drop
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Mark as done">
            <span>
              <Button disabled={isBusy} onClick={() => onStatusChange('DONE')} size="small">
                Done
              </Button>
            </span>
          </Tooltip>
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
};

export const ActionList = ({
  actions,
  canComplete = true,
  canCreate,
  draft,
  emptyLabel,
  isBusy,
  members,
  onCreate,
  onDraftApplied,
  onStatusChange,
  onTextChange,
  title,
}: {
  actions: Action[];
  canComplete?: boolean;
  canCreate: boolean;
  /**
   * A text handed over from the board to start an action from. The nonce changes on every
   * hand-over, so picking the same card twice still refills the field.
   */
  draft?: {nonce: number; text: string};
  emptyLabel: string;
  isBusy: boolean;
  members: TeamMember[];
  onCreate?: (text: string, assigneeId?: string) => void;
  /** The draft is in the field: the page lets go of it, so a remount never applies it again. */
  onDraftApplied?: () => void;
  onStatusChange: (actionId: string, status: ActionStatus) => void;
  onTextChange?: (actionId: string, text: string) => void;
  title: string;
}) => {
  const [text, setText] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Prefill only: the team still rewords it, picks somebody and adds it themselves.
  useEffect(() => {
    if (!draft) return;

    setText(draft.text);
    inputRef.current?.focus({preventScroll: true});
    inputRef.current?.scrollIntoView({behavior: 'smooth', block: 'center'});
    onDraftApplied?.();
  }, [draft?.nonce]);

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
            onTextChange={onTextChange && ((value) => onTextChange(action.id, value))}
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
        <Stack spacing={1.5}>
          <TextField
            fullWidth
            inputRef={inputRef}
            label="New action"
            onChange={(event) => setText(event.target.value)}
            placeholder="Split the CI into two jobs"
            size="small"
            value={text}
          />
          <Stack direction="row" spacing={1.5}>
            <Select
              displayEmpty
              onChange={(event) => setAssigneeId(event.target.value as string)}
              size="small"
              sx={{flexGrow: 1, minWidth: 0}}
              value={assigneeId}
            >
              <MenuItem value="">Nobody</MenuItem>
              {members.map((member) => (
                <MenuItem key={member.userId} value={member.userId}>
                  {member.name}
                </MenuItem>
              ))}
            </Select>
            <Button
              disabled={!text.trim() || isBusy}
              onClick={submit}
              sx={{flexShrink: 0, height: 40}}
              variant="contained"
            >
              Add
            </Button>
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
};
