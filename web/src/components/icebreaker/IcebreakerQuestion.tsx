import type {IcebreakerQuestion as Question} from '@/api/types';
import {Box, Stack, Typography} from '@/ui';
import {SLIPSTREAM} from '@/ui/theme';
import {pickIcebreakerText} from '@/utils/icebreakerText';

export const IcebreakerQuestion = ({question}: {question: Question}) => (
  <Box
    sx={{
      bgcolor: SLIPSTREAM.indigoTint,
      border: `1px solid ${SLIPSTREAM.line}`,
      borderRadius: 3,
      px: {md: 5, xs: 2.5},
      py: {md: 4, xs: 3},
    }}
  >
    <Stack spacing={1.5} sx={{alignItems: 'flex-start'}}>
      <Typography
        component="h2"
        sx={{color: SLIPSTREAM.ink, fontSize: {md: '2.25rem', xs: '1.5rem'}, overflowWrap: 'anywhere'}}
        variant="headingL"
      >
        {pickIcebreakerText(question)}
      </Typography>
    </Stack>
  </Box>
);
