import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import {useState} from 'react';
import {useAutoFocus} from '@/hooks/useAutoFocus';
import {Button, Dialog, Stack, TextField} from '@/ui';

export const CUSTOM_QUESTION_MAX = 200;

export const IcebreakerCustomDialog = ({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) => {
  const [text, setText] = useState('');
  const inputRef = useAutoFocus(isOpen);
  const trimmed = text.trim();

  const close = () => {
    setText('');
    onClose();
  };

  const submit = () => {
    if (!trimmed) return;

    onSubmit(trimmed);
    close();
  };

  return (
    <Dialog onClose={close} open={isOpen} size="small">
      <DialogTitle>Write your own question</DialogTitle>
      <DialogContent>
        <Stack sx={{pt: 1}}>
          <TextField
            fullWidth
            helperText={`${text.length}/${CUSTOM_QUESTION_MAX}`}
            inputRef={inputRef}
            label="Your question"
            multiline
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return;

              // Closing hands the focus back to the opener, which the rest of the key press would trigger.
              event.preventDefault();
              submit();
            }}
            placeholder="What was the best part of your week?"
            slotProps={{htmlInput: {maxLength: CUSTOM_QUESTION_MAX}}}
            value={text}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} variant="text">
          Cancel
        </Button>
        <Button disabled={!trimmed} onClick={submit} variant="contained">
          Use this question
        </Button>
      </DialogActions>
    </Dialog>
  );
};
