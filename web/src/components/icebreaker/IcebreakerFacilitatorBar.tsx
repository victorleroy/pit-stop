import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {useState} from 'react';
import {IcebreakerCustomDialog} from '@/components/icebreaker/IcebreakerCustomDialog';
import {Button, Stack} from '@/ui';

export const IcebreakerFacilitatorBar = ({
  areAnswersRevealed,
  isBusy,
  onCustom,
  onDraw,
  onToggleReveal,
}: {
  areAnswersRevealed: boolean;
  isBusy: boolean;
  onCustom: (text: string) => void;
  onDraw: () => void;
  onToggleReveal: () => void;
}) => {
  const [isWriting, setIsWriting] = useState(false);

  return (
    <Stack direction="row" spacing={1} sx={{alignItems: 'center', flexWrap: 'wrap'}} useFlexGap>
      <Button
        aria-pressed={areAnswersRevealed}
        disabled={isBusy}
        onClick={onToggleReveal}
        size="small"
        startIcon={areAnswersRevealed ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
        variant={areAnswersRevealed ? 'outlined' : 'contained'}
      >
        {areAnswersRevealed ? 'Hide answers' : 'Reveal answers'}
      </Button>
      <Button disabled={isBusy} onClick={onDraw} size="small" variant="outlined">
        Another question
      </Button>
      <Button disabled={isBusy} onClick={() => setIsWriting(true)} size="small" variant="text">
        Write my own
      </Button>

      <IcebreakerCustomDialog
        isOpen={isWriting}
        onClose={() => setIsWriting(false)}
        onSubmit={onCustom}
      />
    </Stack>
  );
};
