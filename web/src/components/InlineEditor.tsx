import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import {IconButton, Stack, TextField} from '@/ui';
import {useRef, useState} from 'react';
import {useAutoFocus} from '@/hooks/useAutoFocus';

export const InlineEditor = ({
  allowEmpty = false,
  label,
  maxLength,
  multiline = false,
  onClose,
  onSave,
  placeholder,
  sx,
  value,
}: {
  /** An empty text is a valid answer (it clears the value) rather than a cancel. */
  allowEmpty?: boolean;
  label?: string;
  maxLength?: number;
  multiline?: boolean;
  onClose: () => void;
  onSave: (text: string) => void;
  placeholder?: string;
  sx?: object;
  value: string;
}) => {
  const [draft, setDraft] = useState(value);
  const inputRef = useAutoFocus(true);
  const isDone = useRef(false);

  const finish = (commit: boolean) => {
    if (isDone.current) return;

    isDone.current = true;
    const text = draft.trim();
    onClose();

    if (commit && (text || allowEmpty) && text !== value) {
      onSave(text);
    }
  };

  return (
    <Stack direction="row" spacing={0.5} sx={{alignItems: 'flex-start', flexGrow: 1, minWidth: 0}}>
      <TextField
        fullWidth
        inputRef={inputRef}
        multiline={multiline}
        onBlur={() => finish(true)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
          } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            finish(true);
          }
        }}
        placeholder={placeholder}
        size="small"
        slotProps={{htmlInput: {'aria-label': label, maxLength}}}
        sx={sx}
        value={draft}
      />
      <IconButton
        aria-label="Save"
        color="primary"
        // Keep the focus in the field: a blur would save before the click lands.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => finish(true)}
        size="small"
      >
        <CheckRoundedIcon fontSize="inherit" />
      </IconButton>
    </Stack>
  );
};
