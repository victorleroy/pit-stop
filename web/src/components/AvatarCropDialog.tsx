import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Slider from '@mui/material/Slider';
import useMediaQuery from '@mui/material/useMediaQuery';
import {useTheme} from '@mui/material/styles';
import {Alert, Box, Button, Dialog, Stack, Typography} from '@/ui';
import type {KeyboardEvent, PointerEvent} from 'react';
import {useEffect, useRef, useState} from 'react';
import type {ImageSize, Pan} from '@/utils/avatarImage';
import {
  clampPan,
  EXPORT_FORMATS,
  EXPORT_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  needsJpegFallback,
  sourceRect,
} from '@/utils/avatarImage';

// The square is the size of the export: what is dragged is what is sent, one to one.
const VIEWPORT = EXPORT_SIZE;
const KEY_STEP = 4;
const KEY_STEP_LARGE = 20;

const ARROWS: Record<string, Pan> = {
  ArrowDown: {x: 0, y: 1},
  ArrowLeft: {x: -1, y: 0},
  ArrowRight: {x: 1, y: 0},
  ArrowUp: {x: 0, y: -1},
};

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export const AvatarCropDialog = ({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (image: Blob) => void;
}) => {
  const isNarrow = useMediaQuery(useTheme().breakpoints.down('sm'));
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{from: Pan; x: number; y: number} | undefined>(undefined);
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [size, setSize] = useState<ImageSize | undefined>(undefined);
  const [hasFailed, setHasFailed] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Pan>({x: 0, y: 0});

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);

    setUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const held = size ? clampPan(pan, VIEWPORT, size, zoom) : pan;
  const scale = size ? (VIEWPORT * zoom) / Math.min(size.width, size.height) : 1;

  const moveBy = (delta: Pan) => {
    if (!size) return;

    setPan(clampPan({x: held.x + delta.x, y: held.y + delta.y}, VIEWPORT, size, zoom));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const arrow = ARROWS[event.key];

    if (!arrow) return;

    event.preventDefault();
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;

    moveBy({x: arrow.x * step, y: arrow.y * step});
  };

  const onPointerDown = (event: PointerEvent) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {from: held, x: event.clientX, y: event.clientY};
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag.current || !size) return;

    setPan(
      clampPan(
        {
          x: drag.current.from.x + event.clientX - drag.current.x,
          y: drag.current.from.y + event.clientY - drag.current.y,
        },
        VIEWPORT,
        size,
        zoom,
      ),
    );
  };

  const onPointerEnd = () => {
    drag.current = undefined;
  };

  const confirm = async () => {
    const image = imageRef.current;

    if (!image || !size) return;

    const rect = sourceRect(held, VIEWPORT, size, zoom);
    const canvas = document.createElement('canvas');

    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;

    const context = canvas.getContext('2d');

    if (!context) return;

    // A transparent PNG would turn black in a JPEG.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, EXPORT_SIZE, EXPORT_SIZE);

    const webp = await toBlob(canvas, EXPORT_FORMATS.webp.type, EXPORT_FORMATS.webp.quality);
    const blob = needsJpegFallback(webp)
      ? await toBlob(canvas, EXPORT_FORMATS.jpeg.type, EXPORT_FORMATS.jpeg.quality)
      : webp;

    if (blob) onConfirm(blob);
  };

  return (
    <Dialog fullScreen={isNarrow} onClose={onCancel} open size="small">
      <DialogTitle>Crop your photo</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{alignItems: 'center', pt: 1}}>
          {hasFailed ? <Alert severity="error">This image could not be read</Alert> : null}

          <Box
            aria-label="Photo position: drag it, or use the arrow keys (hold Shift to go faster)"
            onKeyDown={onKeyDown}
            onPointerCancel={onPointerEnd}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            role="group"
            sx={{
              '&:focus-visible': {outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2},
              bgcolor: 'action.hover',
              cursor: 'grab',
              flexShrink: 0,
              height: VIEWPORT,
              overflow: 'hidden',
              position: 'relative',
              touchAction: 'none',
              userSelect: 'none',
              width: VIEWPORT,
            }}
            tabIndex={0}
          >
            {url ? (
              <img
                alt=""
                draggable={false}
                onError={() => setHasFailed(true)}
                onLoad={(event) =>
                  setSize({
                    height: event.currentTarget.naturalHeight,
                    width: event.currentTarget.naturalWidth,
                  })
                }
                ref={imageRef}
                src={url}
                style={{
                  height: size ? size.height * scale : undefined,
                  left: size ? VIEWPORT / 2 + held.x - (size.width * scale) / 2 : 0,
                  maxWidth: 'none',
                  position: 'absolute',
                  top: size ? VIEWPORT / 2 + held.y - (size.height * scale) / 2 : 0,
                  visibility: size ? 'visible' : 'hidden',
                  width: size ? size.width * scale : undefined,
                }}
              />
            ) : null}

            {/* The circle is what others will see: the dimmed corners are cropped by it. */}
            <Box
              sx={{
                borderRadius: '50%',
                boxShadow: '0 0 0 999px rgba(0, 0, 0, 0.5)',
                inset: 0,
                pointerEvents: 'none',
                position: 'absolute',
              }}
            />
          </Box>

          <Stack direction="row" spacing={2} sx={{alignItems: 'center', width: VIEWPORT}}>
            <Typography color="textSecondary" variant="textXs">
              Zoom
            </Typography>
            <Slider
              aria-label="Zoom"
              disabled={!size}
              max={MAX_ZOOM}
              min={MIN_ZOOM}
              onChange={(_event, value) => {
                const next = value as number;

                setZoom(next);
                if (size) setPan(clampPan(held, VIEWPORT, size, next));
              }}
              step={0.05}
              value={zoom}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} variant="text">
          Cancel
        </Button>
        <Button
          disabled={!size || hasFailed}
          onClick={() => void confirm()}
          variant="contained"
        >
          Use this photo
        </Button>
      </DialogActions>
    </Dialog>
  );
};
