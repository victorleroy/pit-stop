import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import type {IcebreakerAnswer} from '@/api/types';
import {InlineEditor} from '@/components/InlineEditor';
import {UserAvatar} from '@/components/UserAvatar';
import {Box, IconButton, Stack, Tooltip, Typography} from '@/ui';
import {SLIPSTREAM} from '@/ui/theme';
import {noteSurfaceSx, withheldLineSx} from '@/theme/texture';

export const ANSWER_MAX = 140;

/** One person's answer, drawn like a note of the board: face down while its author keeps it hidden. */
export const IcebreakerPostIt = ({
  answer,
  columnIndex,
  isBusy,
  isEditing,
  onClose,
  onEdit,
  onSave,
  onToggle,
}: {
  answer: IcebreakerAnswer;
  columnIndex: number;
  isBusy: boolean;
  isEditing: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSave: (text: string) => void;
  onToggle: () => void;
}) => {
  const {author, mine, revealed, text} = answer;
  const isWithheld = !revealed && !mine;
  const label = revealed ? 'Hide my answer' : 'Show my answer';

  return (
    <Box
      aria-label={isWithheld ? `${author.name} answered` : undefined}
      component="li"
      sx={{...noteSurfaceSx(columnIndex, {isMine: mine, isWithheld}), listStyle: 'none', minWidth: 0, p: 1.25}}
    >
      <Stack spacing={0.75}>
        {isEditing ? (
          <InlineEditor
            allowEmpty
            label="Your answer"
            maxLength={ANSWER_MAX}
            multiline
            onClose={onClose}
            onSave={onSave}
            showCount
            sx={{'& .MuiInputBase-root': {bgcolor: 'rgba(255, 255, 255, 0.7)'}}}
            value={text}
          />
        ) : isWithheld ? (
          <Stack spacing={0.75} sx={{py: 0.5}}>
            <Box sx={withheldLineSx('88%')} />
            <Box sx={withheldLineSx('60%')} />
          </Stack>
        ) : (
          <Typography
            onClick={mine ? onEdit : undefined}
            onKeyDown={
              mine
                ? (event) => {
                    if (event.key !== 'Enter') return;

                    event.preventDefault();
                    onEdit();
                  }
                : undefined
            }
            role={mine ? 'button' : undefined}
            sx={{
              color: 'inherit',
              cursor: mine ? 'text' : 'default',
              fontSize: '0.875rem',
              lineHeight: 1.4,
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
            }}
            tabIndex={mine ? 0 : undefined}
            variant="textM"
          >
            {text}
          </Typography>
        )}

        <Stack direction="row" spacing={1} sx={{alignItems: 'center', minHeight: 20}}>
          <UserAvatar
            {...author}
            decorative
            size="small"
            sx={{flexShrink: 0, fontSize: 10, fontWeight: 700, height: 20, width: 20}}
          />
          <Typography
            noWrap
            sx={{
              color: mine ? SLIPSTREAM.indigo : 'inherit',
              flexGrow: 1,
              fontWeight: mine ? 700 : undefined,
              minWidth: 0,
              opacity: mine ? 1 : 0.65,
            }}
            title={author.name}
            variant="textXs"
          >
            {mine ? `${author.name} (you)` : author.name}
          </Typography>

          {mine && !isEditing ? (
            <Tooltip title={label}>
              <span>
                <IconButton
                  aria-label={label}
                  aria-pressed={revealed}
                  disabled={isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle();
                  }}
                  size="small"
                  sx={{color: 'inherit', opacity: 0.6}}
                >
                  {revealed ? (
                    <VisibilityOutlinedIcon fontSize="inherit" />
                  ) : (
                    <VisibilityOffOutlinedIcon fontSize="inherit" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
        </Stack>
      </Stack>
    </Box>
  );
};
