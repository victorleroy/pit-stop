import {keyframes, useTheme} from '@mui/material/styles';
import {useEffect, useState} from 'react';
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

const spin = keyframes`
  0% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(100deg) scale(0.88); }
  50% { transform: rotate(190deg) scale(1.06); }
  75% { transform: rotate(280deg) scale(0.9); }
  100% { transform: rotate(360deg) scale(1); }
`;

/**
 * A d6 drawn with pips; without a value it is a blank face still waiting to be rolled, or a
 * question mark when it is the viewer's own die to roll.
 */
export const DieFace = ({
  highlight = false,
  isMystery = false,
  size = 32,
  value,
}: {
  highlight?: boolean;
  isMystery?: boolean;
  size?: number;
  value?: number;
}) => {
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
          stroke={isRolled || isMystery ? accent : palette.divider}
          strokeDasharray={isRolled || isMystery ? undefined : '3 2.5'}
          strokeWidth={1.5}
          width={21}
          x={1.5}
          y={1.5}
        />
        {(PIPS[value ?? 0] ?? []).map(([cx, cy]) => (
          <circle cx={cx} cy={cy} fill={accent} key={`${cx}-${cy}`} r={1.9} />
        ))}
        {isMystery && !isRolled ? (
          <text
            dominantBaseline="central"
            fill={accent}
            fontFamily="inherit"
            fontSize={13}
            fontWeight={700}
            textAnchor="middle"
            x={12}
            y={12.5}
          >
            ?
          </text>
        ) : null}
      </svg>
    </Box>
  );
};

const randomFace = (except: number) => ((except + Math.floor(Math.random() * 5)) % 6) + 1;

/** A die tumbling through random faces while its real value is kept back. */
export const RollingDie = ({highlight = false, size = 32}: {highlight?: boolean; size?: number}) => {
  const {palette} = useTheme();
  const [face, setFace] = useState(() => randomFace(0));

  useEffect(() => {
    const timer = setInterval(() => setFace(randomFace), 110);
    return () => clearInterval(timer);
  }, []);

  const accent = highlight ? palette.primary.main : palette.text.primary;

  return (
    <Box
      aria-hidden
      sx={{
        animation: `${spin} 420ms linear infinite`,
        display: 'inline-flex',
        flexShrink: 0,
        '@media (prefers-reduced-motion: reduce)': {animation: 'none'},
      }}
    >
      <svg height={size} viewBox="0 0 24 24" width={size}>
        <rect fill={palette.background.paper} height={21} rx={5} stroke={accent} strokeWidth={1.5} width={21} x={1.5} y={1.5} />
        {PIPS[face].map(([cx, cy]) => (
          <circle cx={cx} cy={cy} fill={accent} key={`${cx}-${cy}`} r={1.9} />
        ))}
      </svg>
    </Box>
  );
};
