import {useState} from 'react';
import type {IcebreakerAnswer} from '@/api/types';
import {useAutoFocus} from '@/hooks/useAutoFocus';
import {Button, Stack, TextField, Typography} from '@/ui';

export const ANSWER_MAX = 140;

/** One line, sent with Enter. Once sent, the answer reads back with a way to change or retract it. */
export const IcebreakerAnswerForm = ({
  isBusy,
  mine,
  onRemove,
  onSubmit,
}: {
  isBusy: boolean;
  mine: IcebreakerAnswer | undefined;
  onRemove: () => void;
  onSubmit: (text: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const isOpen = !mine || isEditing;
  const inputRef = useAutoFocus(isOpen);
  const trimmed = draft.trim();

  const submit = () => {
    if (!trimmed || isBusy) return;

    onSubmit(trimmed);
    setIsEditing(false);
    setDraft('');
  };

  const edit = () => {
    setDraft(mine?.text ?? '');
    setIsEditing(true);
  };

  if (mine && !isEditing) {
    return (
      <Stack spacing={1}>
        <Typography color="textSecondary" variant="textS">
          Your answer
        </Typography>
        <Typography sx={{overflowWrap: 'anywhere'}} variant="textL">
          {mine.text}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button disabled={isBusy} onClick={edit} size="small" variant="outlined">
            Edit
          </Button>
          <Button disabled={isBusy} onClick={onRemove} size="small" variant="text">
            Remove
          </Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack spacing={1}>
      <TextField
        fullWidth
        helperText={`${draft.length}/${ANSWER_MAX}`}
        inputRef={inputRef}
        label="Your answer"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;

          event.preventDefault();
          submit();
        }}
        placeholder="Answer in one line, or out loud."
        slotProps={{htmlInput: {maxLength: ANSWER_MAX}}}
        value={draft}
      />
      <Stack direction="row" spacing={1}>
        <Button disabled={!trimmed || isBusy} onClick={submit} size="small" variant="contained">
          {mine ? 'Save' : 'Send'}
        </Button>
        {mine ? (
          <Button onClick={() => setIsEditing(false)} size="small" variant="text">
            Cancel
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
};
