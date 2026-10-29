import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import {Box, Button, IconButton, Stack, Tooltip, Typography} from '@/ui';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {Timer, TimerAction} from '@/api/types';
import {SLIPSTREAM} from '@/ui/theme';

const DEFAULT_DURATION_SECONDS = 300;

const EXTEND_SECONDS = 60;

const format = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

type Anchor = {anchoredAt: number; deadline: number; endsAt?: string};

/** How far a fresh snapshot may disagree with the running countdown before it takes over. */
const RE_ANCHOR_MS = 1000;

/**
 * The service only ever sends what is left (and the deadline it implies): the countdown
 * itself runs locally, so it stays smooth without a single extra request.
 *
 * The local deadline is anchored on `remainingMs` rather than on `endsAt`, so a laptop whose
 * clock drifts from the server's still counts down from the right number. It counts from when
 * the board was received, not rendered: a board read back from the cache says what was left
 * back then, not now. Every note added
 * sends a fresh board, and re-anchoring on each would make the seconds hesitate with the
 * network: a snapshot of the same round only takes over when it disagrees by more than a
 * second, which is what a board served from the cache does once a fresher one arrives.
 */
const useRemainingMs = (timer: Timer, receivedAt: number) => {
  const anchorRef = useRef<Anchor | undefined>(undefined);
  const anchor = useMemo(() => {
    if (timer.state !== 'RUNNING') return undefined;

    const anchoredAt = Date.now();
    let deadline: number | undefined;

    if (timer.remainingMs !== undefined) deadline = receivedAt + timer.remainingMs;
    else if (timer.endsAt) deadline = new Date(timer.endsAt).getTime();

    if (deadline === undefined) return undefined;

    const current = anchorRef.current;

    if (
      current &&
      current.endsAt === timer.endsAt &&
      Math.abs(current.deadline - deadline) <= RE_ANCHOR_MS
    ) {
      return current;
    }

    return {anchoredAt, deadline, endsAt: timer.endsAt};
  }, [timer.state, timer.endsAt, timer.remainingMs, receivedAt]);

  useEffect(() => {
    anchorRef.current = anchor;
  }, [anchor]);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!anchor) return undefined;

    let id: number | undefined;

    // Wake up just past each second boundary, so the digits flip at an even pace instead of
    // whenever a fixed interval happens to land.
    const tick = () => {
      const current = Date.now();
      const left = anchor.deadline - current;

      setNow(current);

      if (left > 0) id = window.setTimeout(tick, (left % 1000) + 20);
    };

    tick();

    return () => window.clearTimeout(id);
  }, [anchor]);

  if (timer.state === 'PAUSED') return {isSteady: false, remainingMs: timer.remainingMs ?? 0};
  if (!anchor) return {isSteady: false, remainingMs: 0};

  // `now` may still be the last tick of a previous round: never count from before the anchor.
  return {
    isSteady: now > anchor.anchoredAt,
    remainingMs: Math.max(0, anchor.deadline - Math.max(now, anchor.anchoredAt)),
  };
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
  receivedAt,
  timer,
}: {
  isBusy: boolean;
  isFacilitator: boolean;
  onTimer: (action: TimerAction, seconds?: number) => void;
  /** When the board carrying this timer was received, which `remainingMs` counts from. */
  receivedAt: number;
  timer: Timer;
}) => {
  const {isSteady, remainingMs} = useRemainingMs(timer, receivedAt);
  const isOver = timer.state !== 'IDLE' && remainingMs === 0;
  const totalMs = timer.totalMs ?? 0;
  const left = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;

  if (timer.state === 'IDLE') {
    return isFacilitator ? (
      <Tooltip describeChild title="Start a 5 minute timer">
        {/* A disabled button fires no events: the span keeps the tooltip working. */}
        <span>
          {/* The spoken name holds the visible digits, so "click 5:00" finds the button. */}
          <Button
            aria-label={`Start a ${format(DEFAULT_DURATION_SECONDS * 1000)} timer`}
            disabled={isBusy}
            onClick={() => onTimer('start', DEFAULT_DURATION_SECONDS)}
            size="small"
            startIcon={<TimerOutlinedIcon />}
            variant="outlined"
          >
            {format(DEFAULT_DURATION_SECONDS * 1000)}
          </Button>
        </span>
      </Tooltip>
    ) : null;
  }

  return (
    <Stack direction="row" spacing={1.5} sx={{alignItems: 'center'}}>
      <TimerOutlinedIcon sx={{color: 'text.secondary', fontSize: 20}} />

      {/* A fixed box: neither the digits nor the label beside them may nudge the buttons. */}
      <Stack spacing={0.75} sx={{flexShrink: 0, width: 150}}>
        <Stack direction="row" spacing={1} sx={{alignItems: 'baseline'}}>
          <Typography
            sx={{
              color: isOver ? 'text.secondary' : 'text.primary',
              // Tabular figures so the digits never shuffle as the seconds tick down.
              fontVariantNumeric: 'tabular-nums',
              minWidth: '4.5ch',
            }}
            variant="headingL"
          >
            {isOver ? "0:00" : format(remainingMs)}
          </Typography>

          <Typography
            color="textSecondary"
            sx={{flexGrow: 1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap'}}
            variant="textS"
          >
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
              // Glide from one second to the next while the round runs; a start, a pause or
              // an extension jumps straight to its new length instead of sweeping across.
              transition: isSteady ? 'width 1000ms linear, opacity 160ms ease' : 'opacity 160ms ease',
              width: `${left * 100}%`,
            }}
          />
        </Box>
      </Stack>

      {isFacilitator ? (
        // Icons rather than words: the clock already says what this is, and the toolbar
        // needs the room. The span keeps each tooltip alive while its button is disabled.
        <Stack direction="row" spacing={0.25} sx={{alignItems: 'center'}}>
          <Tooltip title={timer.state === 'PAUSED' ? 'Resume' : 'Pause'}>
            <span>
              <IconButton
                aria-label={timer.state === 'PAUSED' ? 'Resume the timer' : 'Pause the timer'}
                disabled={isBusy}
                onClick={() => onTimer(timer.state === 'PAUSED' ? 'resume' : 'pause')}
                size="small"
              >
                {timer.state === 'PAUSED' ? (
                  <PlayArrowRoundedIcon fontSize="small" />
                ) : (
                  <PauseRoundedIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Add a minute">
            <span>
              <Button
                aria-label="Add a minute to the timer"
                disabled={isBusy}
                onClick={() => onTimer('extend', EXTEND_SECONDS)}
                size="small"
                sx={{minWidth: 0, px: 1}}
                variant="text"
              >
                +1
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Stop">
            <span>
              <IconButton
                aria-label="Stop the timer"
                disabled={isBusy}
                onClick={() => onTimer('stop')}
                size="small"
              >
                <StopRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      ) : null}
    </Stack>
  );
};
