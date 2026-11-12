import type {IcebreakerQuestion as Question} from '@/api/types';
import {Typography} from '@/ui';
import {SLIPSTREAM} from '@/ui/theme';

export const ICEBREAKER_TITLE_ID = 'icebreaker-title';

export const IcebreakerQuestion = ({question}: {question: Question}) => (
  <Typography
    component="h2"
    id={ICEBREAKER_TITLE_ID}
    sx={{color: SLIPSTREAM.ink, fontSize: {md: '2.25rem', xs: '1.5rem'}, overflowWrap: 'anywhere'}}
    variant="headingL"
  >
    {question.text}
  </Typography>
);
