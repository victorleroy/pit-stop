import type {Icebreaker, Participant} from '@/api/types';
import {IcebreakerAnswers} from '@/components/icebreaker/IcebreakerAnswers';
import {IcebreakerQuestion} from '@/components/icebreaker/IcebreakerQuestion';
import {Stack} from '@/ui';

/** The second step of the waiting room: the question, then everybody's post-its. */
export const IcebreakerStep = ({
  icebreaker,
  isBusy,
  onAnswer,
  onHide,
  onRemoveAnswer,
  onReveal,
  participants,
}: {
  icebreaker: Icebreaker;
  isBusy: boolean;
  onAnswer: (text: string) => void;
  onHide: () => void;
  onRemoveAnswer: () => void;
  onReveal: () => void;
  participants: Participant[];
}) => {
  const {answers, question} = icebreaker;
  // Whoever is here or has answered counts once, so the total can never fall below the answers.
  const expected = new Set([
    ...participants.map(({userId}) => userId),
    ...answers.map(({author}) => author.id),
  ]).size;

  return (
    <Stack spacing={3} sx={{minWidth: 0}}>
      {question ? <IcebreakerQuestion question={question} /> : null}
      <IcebreakerAnswers
        answers={answers}
        expected={expected}
        isBusy={isBusy}
        onAnswer={onAnswer}
        onHide={onHide}
        onRemove={onRemoveAnswer}
        onReveal={onReveal}
      />
    </Stack>
  );
};
