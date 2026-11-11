import {keyframes, useTheme} from '@mui/material/styles';
import {Box} from '@/ui';

const PIPS: Record<number, [number, number][]> = {
  1: [[12, 12]],
  2: [[7.5, 7.5], [16.5, 16.5]],
  3: [[7.5, 7.5], [12, 12], [16.5, 16.5]],
  4: [[7.5, 7.5], [16.5, 7.5], [7.5, 16.5], [16.5, 16.5]],
  5: [[7.5, 7.5], [16.5, 7.5], [12, 12], [7.5, 16.5], [16.5, 16.5]],
  6: [[7.5, 7], [16.5, 7], [7.5, 12], [16.5, 12], [7.5, 17], [16.5, 17]],
};

const tumble = keyframes`
  0% { transform: rotate(-200deg) scale(0.6); opacity: 0.4; }
  70% { transform: rotate(12deg) scale(1.08); opacity: 1; }
  100% { transform: rotate(0deg) scale(1); }
`;

/** A d6 drawn with pips; without a value it is a blank face still waiting to be rolled. */
export const DieFace = ({highlight = false, size = 32, value}: {highlight?: boolean; size?: number; value?: number}) => {
  const {palette} = useTheme();
  const isRolled = value !== undefined;
  const accent = highlight ? palette.primary.main : palette.text.primary;

  return (
    <Box
      aria-hidden
      // A new face remounts, so the tumble plays once per roll and never on a re-render.
      key={value ?? 'blank'}
      sx={{
        animation: isRolled ? `${tumble} 520ms cubic-bezier(0.2, 0.8, 0.3, 1)` : 'none',
        display: 'inline-flex',
        flexShrink: 0,
        '@media (prefers-reduced-motion: reduce)': {animation: 'none'},
      }}
    >
      <svg height={size} viewBox="0 0 24 24" width={size}>
        <rect
          fill={isRolled ? palette.background.paper : 'transparent'}
          height={21}
          rx={5}
          stroke={isRolled ? accent : palette.divider}
          strokeDasharray={isRolled ? undefined : '3 2.5'}
          strokeWidth={1.5}
          width={21}
          x={1.5}
          y={1.5}
        />
        {(PIPS[value ?? 0] ?? []).map(([cx, cy]) => (
          <circle cx={cx} cy={cy} fill={accent} key={`${cx}-${cy}`} r={1.9} />
        ))}
      </svg>
    </Box>
  );
};
