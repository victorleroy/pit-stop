import type {IcebreakerAnswer} from '@/api/types';
import {UserAvatar} from '@/components/UserAvatar';
import {Card, Stack, Typography} from '@/ui';

/**
 * Until the reveal, the grid says who answered and nothing more: your own answer is already
 * in front of you, so only the others get a card.
 */
export const IcebreakerAnswers = ({
  answers,
  areRevealed,
}: {
  answers: IcebreakerAnswer[];
  areRevealed: boolean;
}) => {
  if (answers.length === 0) {
    return (
      <Typography color="textSecondary" role="status" variant="textM">
        No answers yet. Answering out loud works too.
      </Typography>
    );
  }

  const shown = areRevealed ? answers : answers.filter(({mine}) => !mine);

  if (shown.length === 0) return null;

  return (
    <Stack
      component="ul"
      sx={{
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: {md: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(2, minmax(0, 1fr))', xs: 'minmax(0, 1fr)'},
        listStyle: 'none',
        m: 0,
        p: 0,
      }}
    >
      {shown.map(({author, text}) => (
        <Card
          aria-label={areRevealed ? undefined : `${author.name} answered`}
          component="li"
          elevation={0}
          key={author.id}
          sx={{minWidth: 0, p: 2}}
        >
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} sx={{alignItems: 'center'}}>
              <UserAvatar {...author} decorative size="small" />
              <Typography sx={{overflowWrap: 'anywhere'}} variant="textM">
                {author.name}
              </Typography>
            </Stack>
            {areRevealed ? (
              <Typography sx={{overflowWrap: 'anywhere'}} variant="textL">
                {text}
              </Typography>
            ) : (
              <Typography color="textSecondary" variant="textS">
                Answered
              </Typography>
            )}
          </Stack>
        </Card>
      ))}
    </Stack>
  );
};
