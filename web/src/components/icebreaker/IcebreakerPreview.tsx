import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {useState} from 'react';
import {IcebreakerCustomDialog} from '@/components/icebreaker/IcebreakerCustomDialog';
import type {Icebreaker} from '@/api/types';
import {Button, Card, Chip, Stack, Typography} from '@/ui';
import {pickIcebreakerText} from '@/utils/icebreakerText';

/** The waiting room's side of the icebreaker: the facilitator checks the question before asking it. */
export const IcebreakerPreview = ({
  icebreaker,
  isBusy,
  isFacilitator,
  onCustom,
  onDraw,
}: {
  icebreaker: Icebreaker | null;
  isBusy: boolean;
  isFacilitator: boolean;
  onCustom: (text: string) => void;
  onDraw: () => void;
}) => {
  const [isWriting, setIsWriting] = useState(false);

  if (!isFacilitator) return null;

  const question = icebreaker?.question;

  return (
    <Card component="section" elevation={0} sx={{p: 2.5}}>
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{alignItems: 'center', flexWrap: 'wrap', gap: 1}}>
          <Typography component="h3" variant="headingS">
            Icebreaker
          </Typography>
          {question ? (
            <Chip icon={<LockOutlinedIcon />} label="Only you can see this" size="small" variant="outlined" />
          ) : null}
        </Stack>

        {question ? (
          <>
            <Typography sx={{overflowWrap: 'anywhere'}} variant="textL">
              {pickIcebreakerText(question)}
            </Typography>
            <Stack direction="row" spacing={1} sx={{flexWrap: 'wrap'}} useFlexGap>
              <Button disabled={isBusy} onClick={onDraw} size="small" variant="outlined">
                Another question
              </Button>
              <Button disabled={isBusy} onClick={() => setIsWriting(true)} size="small" variant="text">
                Write my own
              </Button>
            </Stack>
          </>
        ) : (
          <Stack direction="row" spacing={1} sx={{flexWrap: 'wrap'}} useFlexGap>
            <Button disabled={isBusy} onClick={onDraw} size="small" variant="outlined">
              Add an icebreaker
            </Button>
          </Stack>
        )}
      </Stack>

      <IcebreakerCustomDialog
        isOpen={isWriting}
        onClose={() => setIsWriting(false)}
        onSubmit={onCustom}
      />
    </Card>
  );
};
