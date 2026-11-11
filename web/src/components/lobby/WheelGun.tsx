import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import {useTheme} from '@mui/material/styles';
import type {Theme} from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import type {KeyboardEvent, PointerEvent} from 'react';
import {useEffect, useRef, useState} from 'react';
import type {Participant} from '@/api/types';
import {GameScoreboard} from '@/components/lobby/GameScoreboard';
import type {GameEffect, useLobbyGame} from '@/hooks/useLobbyGame';
import {wheelKey} from '@/hooks/useLobbyGame';
import {Box, Button, Stack, Typography} from '@/ui';
import {isReducedMotion} from '@/utils/lobbyGamePref';
import {playWrenchClack, readTimerMuted, saveTimerMuted, unlockTimerSound} from '@/utils/timerSound';
import {USER_PALETTE, userColour} from '@/utils/userColour';
import type {Arena} from '@/utils/wheelGunModel';
import {
  CAR_LENGTH,
  LANES,
  PIT_BOX,
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

const ARIA_LABEL = 'Wheel Gun game, press 1, 2 or 3 to fit the nearest wheel in that lane';

type Game = ReturnType<typeof useLobbyGame>;

interface Palette {
  asphalt: string;
  free: string;
  line: string;
  success: string;
  text: string;
  tyre: string;
}

const paletteOf = (theme: Theme): Palette => ({
  asphalt: theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[400],
  free: theme.palette.grey[300],
  line: '#FFFFFF',
  success: theme.palette.success.main,
  text: theme.palette.text.primary,
  tyre: '#14161C',
});

const drawTrack = (ctx: CanvasRenderingContext2D, arena: Arena, palette: Palette) => {
  const {height, width} = arena;
  const lane = laneHeight(arena);

  ctx.fillStyle = palette.asphalt;
  ctx.fillRect(0, 0, width, height);

  // Pit box: the zone the keyboard aims at.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(PIT_BOX.from * width, 0, (PIT_BOX.to - PIT_BOX.from) * width, height);
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(PIT_BOX.from * width, 1, (PIT_BOX.to - PIT_BOX.from) * width, height - 2);

  // Pit lane edge (continuous) and speed-limit line (dashed).
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.lineTo(width, 3);
  ctx.stroke();
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(0, height - 3);
  ctx.lineTo(width, height - 3);
  ctx.stroke();

  ctx.setLineDash([3, 9]);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  [1, 2].forEach((boundary) => {
    ctx.beginPath();
    ctx.moveTo(0, boundary * lane);
    ctx.lineTo(width, boundary * lane);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  ctx.fillStyle = palette.text;
  ctx.font = '700 12px sans-serif';
  ctx.textBaseline = 'middle';
  LANES.forEach((index) => ctx.fillText(String(index + 1), 8, (index + 0.5) * lane - lane * 0.28));
  ctx.font = '600 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PIT BOX', ((PIT_BOX.from + PIT_BOX.to) / 2) * width, 14);
  ctx.textAlign = 'start';
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

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(18, -17, 70, 3);

  // Driver's helmet and visor.
  ctx.fillStyle = '#FFFFFF';
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
  ctx.strokeStyle = '#9AA3B2';
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

    drawCar(ctx, left, y, carPx, USER_PALETTE[car.livery % USER_PALETTE.length], palette);

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
  isOn,
  onToggle,
  participants,
  userId,
}: {
  game: Game;
  isConnected: boolean;
  isOn: boolean;
  onToggle: (isOn: boolean) => void;
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
  const [isMuted, setIsMuted] = useState(readTimerMuted);
  const [plusOne, setPlusOne] = useState(0);

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

  const isShown = isOn;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;

    if (!isShown || !canvas || !wrapper) return undefined;

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
          reduced: isReducedMotion(),
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
  }, [height, isShown, userId]);

  const fitted = (target: {carId: number; wheel: 'front' | 'rear'} | undefined) => {
    if (!target || !isConnected) return;

    if (game.tap(target.carId, target.wheel) && !readTimerMuted() && document.visibilityState === 'visible') {
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
        <FormControlLabel
          control={<Switch checked={isOn} onChange={(_event, checked) => onToggle(checked)} />}
          label={`Wheel Gun · ${isOn ? 'On' : 'Off'}`}
        />

        <Box sx={{alignItems: 'center', display: 'flex', gap: 2}}>
          {isOn ? (
            <Box sx={{position: 'relative'}}>
              <Typography variant="textS">Pit stops: {game.teamStops}</Typography>
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
          ) : null}

          <FormControlLabel
            control={
              <Switch
                checked={!isMuted}
                onChange={(_event, checked) => {
                  unlockTimerSound();
                  saveTimerMuted(!checked);
                  setIsMuted(!checked);
                }}
                size="small"
              />
            }
            label="Sounds"
          />
        </Box>
      </Box>

      {isOn ? (
        <Box
          ref={wrapperRef}
          sx={{
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
            style={{display: 'block', height, touchAction: 'manipulation', width: '100%'}}
            tabIndex={0}
          />
        </Box>
      ) : (
        <Stack
          spacing={1.5}
          sx={{
            alignItems: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
            justifyContent: 'center',
            minHeight: height,
            p: 2,
          }}
        >
          <Typography color="textSecondary" variant="textM">
            Wheel Gun is off for you
          </Typography>
          <Button onClick={() => onToggle(true)} variant="outlined">
            Turn on
          </Button>
        </Stack>
      )}

      {isOn && !game.scores.some(({points}) => points > 0) ? (
        <Typography color="textSecondary" variant="textS">
          Tap a wheel to fit it. Finish both wheels for a full pit stop.
        </Typography>
      ) : null}

      <GameScoreboard myUserId={userId} participants={participants} scores={game.scores} />
    </Stack>
  );
};
