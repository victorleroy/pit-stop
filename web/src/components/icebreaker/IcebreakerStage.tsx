import {useState} from 'react';
import type {Icebreaker, Participant} from '@/api/types';
import type {ConfirmRequest} from '@/components/ConfirmDialog';
import {ConfirmDialog} from '@/components/ConfirmDialog';
import {IcebreakerAnswerForm} from '@/components/icebreaker/IcebreakerAnswerForm';
import {IcebreakerAnswers} from '@/components/icebreaker/IcebreakerAnswers';
import {IcebreakerFacilitatorBar} from '@/components/icebreaker/IcebreakerFacilitatorBar';
import {IcebreakerQuestion} from '@/components/icebreaker/IcebreakerQuestion';
import {UserAvatar} from '@/components/UserAvatar';
import {Box, Stack, Typography} from '@/ui';

/** The ICEBREAKER screen: the question, a line to answer it, and who has. No board behind it. */
export const IcebreakerStage = ({
  icebreaker,
  isBusy,
  isFacilitator,
  onAnswer,
  onCustom,
  onDraw,
  onHide,
  onRemoveAnswer,
  onReveal,
  participants,
}: {
  icebreaker: Icebreaker;
  isBusy: boolean;
  isFacilitator: boolean;
  onAnswer: (text: string) => void;
  onCustom: (text: string) => void;
  onDraw: () => void;
  onHide: () => void;
  onRemoveAnswer: () => void;
  onReveal: () => void;
  participants: Participant[];
}) => {
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | undefined>(undefined);
  const {answers, answersRevealed, question} = icebreaker;
  // Whoever is here or has answered counts once, so the total can never fall below the answers.
  const expected = new Set([
    ...participants.map(({userId}) => userId),
    ...answers.map(({author}) => author.id),
  ]).size;

  // A new question makes the old answers meaningless: they go, so say how many first.
  const changeQuestion = (change: () => void) => {
    if (answers.length === 0) {
      change();
      return;
    }

    setConfirmRequest({
      confirmLabel: 'Change the question',
      message: `The ${answers.length} answer${answers.length === 1 ? '' : 's'} given so far will be cleared.`,
      onConfirm: change,
      title: 'Change the question?',
    });
  };

  return (
    <Stack component="section" spacing={3} sx={{minWidth: 0}}>
      <ConfirmDialog onClose={() => setConfirmRequest(undefined)} request={confirmRequest} />

      {question ? <IcebreakerQuestion question={question} /> : null}

      {isFacilitator ? (
        <IcebreakerFacilitatorBar
          areAnswersRevealed={answersRevealed}
          isBusy={isBusy}
          onCustom={(text) => changeQuestion(() => onCustom(text))}
          onDraw={() => changeQuestion(onDraw)}
          onToggleReveal={answersRevealed ? onHide : onReveal}
        />
      ) : null}

      <Box
        sx={{
          bgcolor: {md: 'transparent', xs: 'background.default'},
          bottom: {md: 'auto', xs: 0},
          position: {md: 'static', xs: 'sticky'},
          py: {md: 0, xs: 1},
          zIndex: 2,
        }}
      >
        <IcebreakerAnswerForm
          isBusy={isBusy}
          mine={answers.find(({mine}) => mine)}
          onRemove={onRemoveAnswer}
          onSubmit={onAnswer}
        />
      </Box>

      <Stack direction="row" spacing={1.5} sx={{alignItems: 'center', flexWrap: 'wrap'}} useFlexGap>
        <Typography aria-live="polite" variant="textM">
          {`${answers.length} of ${expected} answered`}
        </Typography>
        {answers.map(({author}) => (
          <UserAvatar decorative key={author.id} {...author} size="small" />
        ))}
      </Stack>

      <IcebreakerAnswers answers={answers} areRevealed={answersRevealed} />
    </Stack>
  );
};
