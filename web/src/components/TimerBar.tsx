import {Box, Button, Stack, Typography} from '@/ui';
import {useEffect, useState} from 'react';
import type {Timer, TimerAction} from '@/api/types';
import {SLIPSTREAM} from '@/ui/theme';

const DEFAULT_DURATION_SECONDS = 300;

const EXTEND_SECONDS = 60;

const format = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * The service only ever sends a deadline (or what is left once paused): the countdown
 * itself runs locally, so it stays smooth without a single extra request.
 */
const useRemainingMs = (timer: Timer) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timer.state !== 'RUNNING') return undefined;

    const id = window.setInterval(() => setNow(Date.now()), 500);

    return () => window.clearInterval(id);
  }, [timer.state, timer.endsAt]);

  if (timer.state === 'PAUSED') return timer.remainingMs ?? 0;
  if (timer.state === 'RUNNING' && timer.endsAt) {
    return Math.max(0, new Date(timer.endsAt).getTime() - now);
  }

  return 0;
};

/**
 * A retro runs on gentle time pressure, so the clock is an ambient thing rather than a
 * widget: tabular numerals that never jitter, a bar that only exists while a round is on,
 * and nothing at all when it is idle. Never a red countdown — this is not an alarm.
 */
export const TimerControls = ({
  isBusy,
  isFacilitator,
  onTimer,
  timer,
}: {
  isBusy: boolean;
  isFacilitator: boolean;
  onTimer: (action: TimerAction, seconds?: number) => void;
  timer: Timer;
}) => {
  const remainingMs = useRemainingMs(timer);
  const isOver = timer.state !== 'IDLE' && remainingMs === 0;
  const totalMs = timer.totalMs ?? 0;
  const left = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;

  if (timer.state === 'IDLE') {
    return isFacilitator ? (
      <Button
        disabled={isBusy}
        onClick={() => onTimer('start', DEFAULT_DURATION_SECONDS)}
        size="small"
        variant="text"
      >
        Start 5 min
      </Button>
    ) : null;
  }

  return (
    <Stack direction="row" spacing={1.5} sx={{alignItems: 'center'}}>
      <Stack spacing={0.75} sx={{minWidth: 148}}>
        <Stack direction="row" spacing={1} sx={{alignItems: 'baseline'}}>
          <Typography
            sx={{
              color: isOver ? 'text.secondary' : 'text.primary',
              // Tabular figures so the digits never shuffle as the seconds tick down.
              fontVariantNumeric: 'tabular-nums',
            }}
            variant="headingL"
          >
            {isOver ? "0:00" : format(remainingMs)}
          </Typography>

          <Typography color="textSecondary" sx={{flexGrow: 1}} variant="textS">
            {timer.state === 'PAUSED' ? 'paused' : totalMs ? `of ${format(totalMs)}` : ''}
          </Typography>
        </Stack>

        <Box sx={{bgcolor: '#EEF2F7', borderRadius: 999, height: 5, overflow: 'hidden'}}>
          <Box
            sx={{
              // The bar drains rather than fills: what you read is the time you have left.
              backgroundImage: `linear-gradient(90deg, ${SLIPSTREAM.indigo}, #FF5C9D)`,
              borderRadius: 999,
              height: '100%',
              opacity: timer.state === 'PAUSED' ? 0.45 : 1,
              transition: 'width 500ms linear, opacity 160ms ease',
              width: `${left * 100}%`,
            }}
          />
        </Box>
      </Stack>

      {isFacilitator ? (
        <Stack direction="row" spacing={0.25}>
          <Button
            disabled={isBusy}
            onClick={() => onTimer(timer.state === 'PAUSED' ? 'resume' : 'pause')}
            size="small"
            variant="text"
          >
            {timer.state === 'PAUSED' ? 'Resume' : 'Pause'}
          </Button>
          <Button
            disabled={isBusy}
            onClick={() => onTimer('extend', EXTEND_SECONDS)}
            size="small"
            variant="text"
          >
            +1 min
          </Button>
          <Button disabled={isBusy} onClick={() => onTimer('stop')} size="small" variant="text">
            Stop
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
};
