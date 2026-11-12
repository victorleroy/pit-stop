import {useTheme} from '@mui/material/styles';
import type {Theme} from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import type {KeyboardEvent, PointerEvent} from 'react';
import {useEffect, useRef, useState} from 'react';
import type {Participant} from '@/api/types';
import {GameScoreboard} from '@/components/lobby/GameScoreboard';
import type {GameEffect, useLobbyGame} from '@/hooks/useLobbyGame';
import {wheelKey} from '@/hooks/useLobbyGame';
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import {Box, IconButton, Stack, Tooltip, Typography} from '@/ui';
import type {TrackPalette} from '@/ui/theme';
import {playWrenchClack, readTimerMuted, saveTimerMuted, unlockTimerSound} from '@/utils/timerSound';
import {userColour} from '@/utils/userColour';
import type {Arena} from '@/utils/wheelGunModel';
import {
  CAR_LENGTH,
  LANES,
  WHEEL_OFFSETS,
  carX,
  hitTest,
  laneHeight,
  pickKeyboardTarget,
  wheelPoint,
  wheelRadius,
} from '@/utils/wheelGunModel';

export const ARENA_HEIGHT = {desktop: 280, mobile: 200};

export const SPARK_MS = 250;
export const SERVICED_MS = 400;
const SPARK_PARTICLES = 6;
const PLUS_ONE_MS = 1_200;

const WRENCH_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text x="2" y="26" font-size="26">🔧</text></svg>',
)}") 6 6, pointer`;

const ARIA_LABEL ='Wheel Gun game, press 1, 2 or 3 to fit the furthest free wheel of that lane';

type Game = ReturnType<typeof useLobbyGame>;

export interface Palette extends TrackPalette {
  font: string;
  success: string;
}

const paletteOf = (theme: Theme): Palette => ({
  ...theme.palette.track,
  font: theme.typography.fontFamily ?? 'sans-serif',
  success: theme.palette.success.main,
});

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const drawTrack = (ctx: CanvasRenderingContext2D, arena: Arena, palette: Palette) => {
  const {height, width} = arena;
  const lane = laneHeight(arena);

  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = palette.lane;
  ctx.lineWidth = 1;
  ctx.setLineDash([10, 8]);
  [1, 2].forEach((boundary) => {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(boundary * lane) + 0.5);
    ctx.lineTo(width, Math.round(boundary * lane) + 0.5);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  ctx.fillStyle = palette.text;
  ctx.font = `600 12px ${palette.font}`;
  ctx.textBaseline = 'middle';
  LANES.forEach((index) => ctx.fillText(String(index + 1), 10, (index + 0.5) * lane - lane * 0.28));
};

const drawCar = (
  ctx: CanvasRenderingContext2D,
  carLeft: number,
  wheelY: number,
  carPx: number,
  livery: string,
  palette: Palette,
) => {
  const unit = carPx / 120;

  ctx.save();
  ctx.translate(carLeft, wheelY);
  ctx.scale(unit, unit);

  // Rear wing, then front wing, behind the body.
  ctx.fillStyle = palette.tyre;
  ctx.fillRect(1, -38, 14, 4);
  ctx.fillRect(4, -38, 4, 26);
  ctx.fillRect(104, 3, 16, 4);

  ctx.fillStyle = livery;
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.lineTo(12, -22);
  ctx.lineTo(40, -32);
  ctx.lineTo(50, -34);
  ctx.lineTo(56, -24);
  ctx.lineTo(74, -22);
  ctx.lineTo(92, -17);
  ctx.lineTo(119, -7);
  ctx.lineTo(119, -1);
  ctx.lineTo(102, 3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.stripe;
  ctx.fillRect(18, -17, 70, 3);

  // Driver's helmet and visor.
  ctx.fillStyle = palette.stripe;
  ctx.beginPath();
  ctx.arc(64, -29, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.tyre;
  ctx.fillRect(65, -31, 6, 3);

  ctx.restore();
};

const drawWheel = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  nut: string,
  palette: Palette,
) => {
  ctx.fillStyle = palette.tyre;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = Math.max(1, radius * 0.14);
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = nut;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
  ctx.fill();
};

const drawFrame = ({
  arena,
  ctx,
  effects,
  game,
  palette,
  reduced,
  userId,
}: {
  arena: Arena;
  ctx: CanvasRenderingContext2D;
  effects: GameEffect[];
  game: Game;
  palette: Palette;
  reduced: boolean;
  userId?: string;
}) => {
  const at = game.now();
  const local = Date.now();
  const {cars, pending, taken} = game.model.current;
  const radius = wheelRadius(arena);

  drawTrack(ctx, arena, palette);

  const sparking = (carId: number, wheel: 'front' | 'rear') =>
    !reduced &&
    effects.some(
      (effect) =>
        effect.kind === 'spark' &&
        effect.carId === carId &&
        effect.wheel === wheel &&
        local - effect.at < SPARK_MS,
    );

  cars.forEach((car) => {
    const left = carX(car, at) * arena.width;
    const carPx = CAR_LENGTH * arena.width;

    if (left > arena.width || left + carPx < 0) return;

    const {y} = wheelPoint(car, 'rear', at, arena);

    drawCar(ctx, left, y, carPx, palette.liveries[car.livery % palette.liveries.length], palette);

    (['rear', 'front'] as const).forEach((wheel) => {
      const key = wheelKey(car.id, wheel);
      const owner = taken.get(key) ?? (pending.has(key) ? userId : undefined);
      const nut = owner && !sparking(car.id, wheel) ? userColour(owner) : palette.free;

      drawWheel(ctx, left + WHEEL_OFFSETS[wheel] * arena.width, y, radius, nut, palette);
    });

    if (!reduced) {
      const serviced = effects.find(
        (effect) => effect.kind === 'serviced' && effect.carId === car.id && local - effect.at < SERVICED_MS,
      );

      if (serviced) {
        ctx.strokeStyle = palette.success;
        ctx.lineWidth = 3;
        ctx.strokeRect(left - 3, y - carPx * 0.33, carPx + 6, carPx * 0.33 + radius + 6);
      }
    }
  });

  if (reduced) return;

  effects.forEach((effect) => {
    const age = local - effect.at;
    const car = cars.get(effect.carId);

    if (effect.kind !== 'spark' || age >= SPARK_MS || !car) return;

    const centre = wheelPoint(car, effect.wheel, at, arena);
    const progress = age / SPARK_MS;

    ctx.fillStyle = userColour(effect.userId);
    ctx.globalAlpha = 1 - progress;
    for (let particle = 0; particle < SPARK_PARTICLES; particle += 1) {
      const angle = (particle / SPARK_PARTICLES) * Math.PI * 2;
      const distance = radius + progress * 16;

      ctx.beginPath();
      ctx.arc(centre.x + Math.cos(angle) * distance, centre.y + Math.sin(angle) * distance, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
};

export const WheelGun = ({
  game,
  isConnected,
  participants,
  userId,
}: {
  game: Game;
  isConnected: boolean;
  participants: Participant[];
  userId?: string;
}) => {
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up('md'));
  const height = isWide ? ARENA_HEIGHT.desktop : ARENA_HEIGHT.mobile;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const effects = useRef<GameEffect[]>([]);
  const arena = useRef<Arena>({height, width: 300});
  const palette = useRef(paletteOf(theme));
  palette.current = paletteOf(theme);
  const [plusOne, setPlusOne] = useState(0);
  const [isMuted, setIsMuted] = useState(readTimerMuted);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const toggleMuted = () => {
    saveTimerMuted(!isMuted);
    setIsMuted(!isMuted);
  };

  const gameRef = useRef(game);
  gameRef.current = game;

  const {addEffectListener} = game;

  useEffect(
    () =>
      addEffectListener((effect) => {
        effects.current = [...effects.current.filter(({at}) => Date.now() - at < 1_000), effect];

        if (effect.kind === 'serviced') {
          setPlusOne(effect.at);
          window.setTimeout(() => setPlusOne((current) => (current === effect.at ? 0 : current)), PLUS_ONE_MS);
        }
      }),
    [addEffectListener],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;

    if (!canvas || !wrapper) return undefined;

    const ratio = window.devicePixelRatio || 1;
    let frame = 0;

    const resize = () => {
      const width = Math.max(1, Math.floor(wrapper.clientWidth));
      arena.current = {height, width};
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    };

    const render = () => {
      frame = 0;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawFrame({
          arena: arena.current,
          ctx,
          effects: effects.current,
          game: gameRef.current,
          palette: palette.current,
          reduced: prefersReducedMotion(),
          userId,
        });
      }

      if (document.visibilityState !== 'hidden') frame = window.requestAnimationFrame(render);
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'hidden' && !frame) frame = window.requestAnimationFrame(render);
    };

    resize();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    observer?.observe(wrapper);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [height, userId]);

  const fitted = (target: {carId: number; wheel: 'front' | 'rear'} | undefined) => {
    if (!target || !isConnected) return;

    if (game.tap(target.carId, target.wheel) && !isMutedRef.current && document.visibilityState === 'visible') {
      playWrenchClack();
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    unlockTimerSound();

    const box = event.currentTarget.getBoundingClientRect();
    const model = game.model.current;

    fitted(
      hitTest({
        arena: arena.current,
        at: game.now(),
        cars: [...model.cars.values()],
        isFree: game.isFree,
        point: {x: event.clientX - box.left, y: event.clientY - box.top},
      }),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    unlockTimerSound();

    if (event.key === 'Escape') {
      event.currentTarget.blur();
      return;
    }

    if (!['1', '2', '3'].includes(event.key)) return;

    event.preventDefault();
    fitted(
      pickKeyboardTarget({
        at: game.now(),
        cars: [...game.model.current.cars.values()],
        isFree: game.isFree,
        lane: Number(event.key) - 1,
      }),
    );
  };

  return (
    <Stack spacing={1.5}>
      <Box sx={{alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between'}}>
        <Typography component="h3" variant="headingS">
          Wheel Gun
        </Typography>

        <Box sx={{alignItems: 'center', display: 'flex', gap: 0.5, position: 'relative'}}>
          <Tooltip title={isMuted ? 'Unmute sounds' : 'Mute sounds'}>
            <IconButton aria-label={isMuted ? 'Unmute sounds' : 'Mute sounds'} onClick={toggleMuted} size="small">
              {isMuted ? <VolumeOffRoundedIcon fontSize="small" /> : <VolumeUpRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Typography sx={{fontVariantNumeric: 'tabular-nums'}} variant="textS">
            Pit stops: {game.teamStops}
          </Typography>
          {plusOne ? (
            <Typography
              aria-hidden
              sx={{color: 'success.main', fontWeight: 700, left: '50%', position: 'absolute', top: -18, transform: 'translateX(-50%)'}}
              variant="textS"
            >
              +1
            </Typography>
          ) : null}
        </Box>
      </Box>

      <Box
        ref={wrapperRef}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          filter: isConnected ? 'none' : 'grayscale(1)',
          height,
          opacity: isConnected ? 1 : 0.55,
          overflow: 'hidden',
          width: '100%',
        }}
      >
        <canvas
          aria-label={ARIA_LABEL}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          ref={canvasRef}
          role="img"
          style={{cursor: WRENCH_CURSOR, display: 'block', height, touchAction: 'manipulation', width: '100%'}}
          tabIndex={0}
        />
      </Box>

      {!game.scores.some(({points}) => points > 0) ? (
        <Typography color="textSecondary" variant="textS">
          Tap a wheel to fit it. Finish both wheels for a full pit stop.
        </Typography>
      ) : null}

      <GameScoreboard myUserId={userId} participants={participants} scores={game.scores} />
    </Stack>
  );
};
