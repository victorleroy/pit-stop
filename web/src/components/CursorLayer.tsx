import {Box} from '@/ui';
import type {Cursor} from '@/api/types';
import {cursorColour} from '@/theme/texture';

/**
 * Pointers arrive eight times a second; the transition draws the frames in between, which is
 * what makes them feel continuous rather than teleporting.
 */
const GLIDE = 'left 120ms linear, top 120ms linear';

export const CursorLayer = ({cursors}: {cursors: Cursor[]}) => (
  <Box
    sx={{
      inset: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      position: 'absolute',
      zIndex: 5,
    }}
  >
    {cursors.map(({name, userId, x, y}) => {
      const colour = cursorColour(userId);

      return (
        <Box
          key={userId}
          sx={{
            left: `${x * 100}%`,
            position: 'absolute',
            top: `${y * 100}%`,
            transition: GLIDE,
          }}
        >
          <svg fill="none" height="22" viewBox="0 0 18 22" width="18">
            <path
              d="M1 1L16.5 9.5L9.5 11.5L6.5 19L1 1Z"
              fill={colour}
              stroke="white"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>

          <Box
            sx={{
              bgcolor: colour,
              borderRadius: 999,
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 700,
              left: 14,
              lineHeight: '14px',
              maxWidth: 140,
              overflow: 'hidden',
              position: 'absolute',
              px: 0.75,
              py: 0.25,
              textOverflow: 'ellipsis',
              top: 16,
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </Box>
        </Box>
      );
    })}
  </Box>
);
