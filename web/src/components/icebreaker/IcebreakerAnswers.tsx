import {useState} from 'react';
import type {IcebreakerAnswer} from '@/api/types';
import {ANSWER_MAX, IcebreakerPostIt} from '@/components/icebreaker/IcebreakerPostIt';
import {InlineEditor} from '@/components/InlineEditor';
import {Box, Button, Stack, Typography} from '@/ui';
import {SLIPSTREAM} from '@/ui/theme';
import {noteSurfaceSx} from '@/theme/texture';

/** One zone, like a column of the board: a click in its empty part writes (or edits) your post-it. */
export const IcebreakerAnswers = ({
  answers,
  expected,
  isBusy,
  onAnswer,
  onHide,
  onRemove,
  onReveal,
}: {
  answers: IcebreakerAnswer[];
  expected: number;
  isBusy: boolean;
  onAnswer: (text: string) => void;
  onHide: () => void;
  onRemove: () => void;
  onReveal: () => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const mine = answers.find((answer) => answer.mine);

  const save = (text: string) => {
    if (text) onAnswer(text);
    else if (mine) onRemove();
  };

  return (
    <Stack spacing={1}>
      <Typography aria-live="polite" color="textSecondary" variant="textS">
        {`${answers.length} of ${expected} answered`}
      </Typography>

      <Box
        aria-label="Answers"
        onClick={(event) => {
          if (isEditing) event.currentTarget.querySelector('textarea')?.focus();
          else setIsEditing(true);
        }}
        onMouseDown={(event) => {
          if (isEditing && !(event.target instanceof HTMLTextAreaElement)) event.preventDefault();
        }}
        role="group"
        sx={{
          bgcolor: SLIPSTREAM.ground,
          border: `1px dashed ${SLIPSTREAM.line}`,
          borderRadius: 3,
          cursor: 'text',
          minHeight: 180,
          p: 2,
        }}
      >
        <Stack spacing={2}>
          {!mine && !isEditing ? (
            <Button
              onClick={() => setIsEditing(true)}
              sx={{justifyContent: 'flex-start', textAlign: 'left'}}
              variant="text"
            >
              Click here to add your answer. It stays hidden until you share it. Answering out loud works too.
            </Button>
          ) : null}

          {answers.length > 0 || isEditing ? (
            <Box
              component="ul"
              sx={{
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: {
                  md: 'repeat(3, minmax(0, 1fr))',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  xs: 'minmax(0, 1fr)',
                },
                m: 0,
                p: 0,
              }}
            >
              {answers.map((answer, index) => (
                <IcebreakerPostIt
                  answer={answer}
                  columnIndex={index}
                  isBusy={isBusy}
                  isEditing={answer.mine && isEditing}
                  key={answer.author.id}
                  onClose={() => setIsEditing(false)}
                  onEdit={() => setIsEditing(true)}
                  onSave={save}
                  onToggle={answer.revealed ? onHide : onReveal}
                />
              ))}
              {!mine && isEditing ? (
                <Box
                  component="li"
                  sx={{...noteSurfaceSx(answers.length, {isMine: true, isWithheld: false}), listStyle: 'none', p: 1.25}}
                >
                  <InlineEditor
                    allowEmpty
                    label="Your answer"
                    maxLength={ANSWER_MAX}
                    multiline
                    onClose={() => setIsEditing(false)}
                    onSave={save}
                    showCount
                    sx={{'& .MuiInputBase-root': {bgcolor: 'rgba(255, 255, 255, 0.7)'}}}
                    value=""
                  />
                </Box>
              ) : null}
            </Box>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
};
