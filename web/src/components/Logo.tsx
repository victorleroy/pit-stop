import {Stack, Typography} from '@/ui';

/**
 * A lap with a deliberate break in it: the ring is the sprint going round, the gap is the
 * stop.
 */
export const LogoMark = ({size = 28}: {size?: number}) => (
  <svg fill="none" height={size} viewBox="0 0 32 32" width={size}>
    <circle
      cx="16"
      cy="16"
      r="12"
      stroke="currentColor"
      strokeDasharray="56 20"
      strokeLinecap="round"
      strokeWidth="4"
      transform="rotate(-108 16 16)"
    />
    <circle cx="16" cy="16" fill="currentColor" r="4" />
  </svg>
);

/**
 * Two words, two lines: stacked against the square mark the wordmark reads as one block
 * instead of a long strip.
 *
 * Side by side, the eye centres on the wordmark and not on the box around the lockup, so a
 * centred layout reads as shifted to the right however exact the maths. Hence `stacked`,
 * where mark and words share one axis: on a centred hero there is nothing left to be off.
 */
export const Logo = ({
  size = 'medium',
  stacked = false,
}: {
  size?: 'large' | 'medium';
  stacked?: boolean;
}) => {
  const isLarge = size === 'large';

  return (
    <Stack
      direction={stacked ? 'column' : 'row'}
      spacing={stacked ? 1.5 : 1.25}
      sx={{alignItems: 'center'}}
    >
      <LogoMark size={isLarge ? 46 : 32} />
      <Stack sx={{gap: 0}}>
        {['pit', 'stop'].map((word) => (
          <Typography
            key={word}
            sx={{
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 0.98,
              // Never inherited: the alignment belongs to the lockup, not to its surroundings.
              textAlign: stacked ? 'center' : 'left',
            }}
            variant={isLarge ? 'headingL' : 'headingS'}
          >
            {word}
          </Typography>
        ))}
      </Stack>
    </Stack>
  );
};
