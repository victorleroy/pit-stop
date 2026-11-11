import {useState} from 'react';
import type {Icebreaker} from '@/api/types';
import {UserAvatar} from '@/components/UserAvatar';
import {Chip, Popover, Stack, Typography} from '@/ui';

/** What the retro opened with, kept one click away once it has moved on. */
export const IcebreakerRecap = ({icebreaker}: {icebreaker: Icebreaker}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const {answers, question} = icebreaker;

  if (!question) return null;

  const written = answers.filter(({revealed, text}) => revealed && text);

  return (
    <>
      <Chip
        aria-haspopup="dialog"
        label={`Icebreaker: ${question.text}`}
        onClick={(event) => setAnchor(event.currentTarget)}
        size="small"
        sx={{maxWidth: 320}}
        variant="outlined"
      />
      <Popover
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        open={Boolean(anchor)}
        slotProps={{paper: {sx: {maxWidth: 420, p: 2}}}}
      >
        <Stack spacing={1.5}>
          <Typography component="h3" sx={{overflowWrap: 'anywhere'}} variant="headingS">
            {question.text}
          </Typography>
          {written.length === 0 ? (
            <Typography color="textSecondary" variant="textS">
              No answer was shared.
            </Typography>
          ) : (
            <Stack component="ul" spacing={1.5} sx={{listStyle: 'none', m: 0, p: 0}}>
              {written.map(({author, text}) => (
                <Stack component="li" direction="row" key={author.id} spacing={1} sx={{alignItems: 'flex-start'}}>
                  <UserAvatar {...author} decorative size="small" />
                  <Stack sx={{minWidth: 0}}>
                    <Typography variant="textM">{author.name}</Typography>
                    <Typography sx={{overflowWrap: 'anywhere'}} variant="textS">
                      {text}
                    </Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      </Popover>
    </>
  );
};
