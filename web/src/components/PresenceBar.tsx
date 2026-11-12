import {keyframes} from '@mui/material/styles';
import {useLayoutEffect, useRef, useState} from 'react';
import {Avatar, Box, Chip, Stack, Tooltip, Typography} from '@/ui';
import type {Board, DieRoll, Participant} from '@/api/types';
import {DieFace, RollingDie} from '@/components/DieFace';
import {UserAvatar} from '@/components/UserAvatar';
import {presenceOrder} from '@/utils/speakingOrder';
import type {PresenceSlot} from '@/utils/speakingOrder';
import {voteProgress} from '@/utils/voteProgress';

const ordinal = (rank: number) => {
  const tens = rank % 100;
  if (tens >= 11 && tens <= 13) return `${rank}th`;
  return `${rank}${['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th'}`;
};

const land = keyframes`
  0% { transform: translateY(-14px) scale(0.5); opacity: 0; }
  70% { transform: translateY(2px) scale(1.1); opacity: 1; }
  100% { transform: none; }
`;

/**
 * Slides each avatar from where it was to where it is when the order changes, so a roll
 * coming in reads as people stepping into line rather than the row jumping.
 */
const useReorderSlide = (order: string) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const isReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, number>();

    for (const element of Array.from(row.children) as HTMLElement[]) {
      const key = element.dataset.userId;
      if (!key) continue;

      next.set(key, element.offsetLeft);
      const previous = positions.current.get(key);
      const shift = previous === undefined ? 0 : previous - element.offsetLeft;

      if (shift && !isReduced && typeof element.animate === 'function') {
        element.animate([{transform: `translateX(${shift}px)`}, {transform: 'none'}], {
          duration: 320,
          easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
        });
      }
    }

    positions.current = next;
  }, [order]);

  return rowRef;
};

const AVATAR = 28;
const GAP = 4;
const RANKED_SLOT = 38;
const MAX_TOOLTIP_LINES = 12;

const useAvailableWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
};

export const PresenceBar = ({
  board,
  dice,
  isConnected,
  participants,
}: {
  board: Board;
  /** In DISCUSS: the settled rolls rank the avatars, and a die spins under whoever is rolling. */
  dice?: {rolls: DieRoll[]; spinningIds: string[]};
  isConnected: boolean;
  participants: Participant[];
}) => {
  const progress = board.phase === 'VOTE' ? voteProgress(board, participants) : undefined;
  const slots: PresenceSlot[] = dice ? presenceOrder(participants, dice.rolls) : participants;
  const [availableRef, available] = useAvailableWidth();
  const slotWidth = slots.some(({rank}) => rank) ? RANKED_SLOT : AVATAR;
  const capacity =
    available === undefined ? Infinity : Math.max(1, Math.floor((available + GAP) / (slotWidth + GAP)));
  const shown = slots.length > capacity ? slots.slice(0, capacity - 1) : slots;
  const hidden = slots.slice(shown.length);
  const rowRef = useReorderSlide(shown.map(({userId}) => userId).join());

  const describe = (slot: PresenceSlot) => {
    const isRolling = dice?.spinningIds.includes(slot.userId);

    return progress
      ? `${slot.name} · ${progress.used(slot.userId)}/${board.maxVotes} votes`
      : slot.rank && slot.value
        ? `${slot.name} · rolled ${slot.value} · speaks ${ordinal(slot.rank)}`
        : isRolling
          ? `${slot.name} is rolling…`
          : slot.name;
  };

  return (
    <Stack direction="row" spacing={1} sx={{alignItems: 'center', minWidth: 0, width: '100%'}}>
      {isConnected ? null : (
        <Chip color="default" label="Reconnecting…" size="small" variant="outlined" />
      )}

      <Box
        ref={availableRef}
        sx={{
          display: 'flex',
          flex: '1 1 0',
          justifyContent: {xs: 'flex-start', md: 'flex-end'},
          minWidth: 0,
          overflowClipMargin: '4px',
          overflowX: 'clip',
        }}
      >
        <Stack
          aria-label={dice ? 'Speaking order' : undefined}
          component={dice ? 'ol' : 'div'}
          direction="row"
          ref={rowRef}
          spacing={0.5}
          sx={{alignItems: 'flex-start', listStyle: 'none', m: 0, p: 0, position: 'relative'}}
        >
          {shown.map((slot) => {
            const {rank, value} = slot;
            const isRolling = dice?.spinningIds.includes(slot.userId);

            return (
              <Tooltip key={slot.userId} title={describe(slot)}>
                {/* A wrapper to hang the tooltip on: the avatar itself takes no ref. */}
                <Box
                  component={dice ? 'li' : 'span'}
                  data-user-id={slot.userId}
                  sx={{alignItems: 'center', display: 'inline-flex', flexDirection: 'column'}}
                >
                  <UserAvatar
                    {...slot}
                    size="small"
                    sx={{
                      ...(progress?.used(slot.userId) === board.maxVotes && {
                        outline: '2px solid',
                        outlineColor: 'success.main',
                        outlineOffset: '1px',
                      }),
                    }}
                  />
                  {rank && value ? (
                    <Stack
                      aria-label={`${ordinal(rank)}, rolled ${value}`}
                      direction="row"
                      key={value}
                      role="img"
                      sx={{
                        alignItems: 'center',
                        animation: `${land} 420ms cubic-bezier(0.2, 0.8, 0.3, 1)`,
                        bgcolor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'primary.main',
                        borderRadius: 999,
                        gap: '2px',
                        height: 18,
                        mt: '-6px',
                        pl: '5px',
                        pr: '2px',
                        zIndex: 1,
                        '@media (prefers-reduced-motion: reduce)': {animation: 'none'},
                      }}
                    >
                      <Typography
                        component="span"
                        sx={{color: 'primary.main', fontSize: 11, fontWeight: 700, lineHeight: 1}}
                      >
                        {rank}
                      </Typography>
                      <DieFace highlight size={13} value={value} />
                    </Stack>
                  ) : isRolling ? (
                    <Box
                      aria-label={`${slot.name} is rolling`}
                      role="img"
                      sx={{display: 'inline-flex', mt: '-6px', zIndex: 1}}
                    >
                      <RollingDie size={16} />
                    </Box>
                  ) : null}
                </Box>
              </Tooltip>
            );
          })}

          {hidden.length > 0 ? (
            <Tooltip
              title={
                <Box component="span" sx={{whiteSpace: 'pre-line'}}>
                  {[
                    ...hidden.slice(0, MAX_TOOLTIP_LINES).map(describe),
                    ...(hidden.length > MAX_TOOLTIP_LINES ? [`+${hidden.length - MAX_TOOLTIP_LINES} more`] : []),
                  ].join('\n')}
                </Box>
              }
            >
              <Box
                aria-label={`${hidden.length} more`}
                component={dice ? 'li' : 'span'}
                role={dice ? undefined : 'img'}
                sx={{display: 'inline-flex'}}
                tabIndex={0}
              >
                <Avatar size="small" sx={{bgcolor: 'divider', color: 'text.primary', fontWeight: 700}}>
                  +{hidden.length}
                </Avatar>
              </Box>
            </Tooltip>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
};
