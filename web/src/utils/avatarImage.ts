export const EXPORT_SIZE = 256;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export const EXPORT_FORMATS = {
  jpeg: {quality: 0.9, type: 'image/jpeg'},
  webp: {quality: 0.85, type: 'image/webp'},
} as const;

export interface Pan {
  x: number;
  y: number;
}

export interface ImageSize {
  height: number;
  width: number;
}

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** Pixels on screen per pixel of the image: at 1× the shorter side just fills the square. */
const scaleOf = (viewport: number, image: ImageSize, zoom: number) =>
  (viewport * zoom) / Math.min(image.width, image.height);

/**
 * `pan` is how far the image centre sits from the centre of the square, in screen pixels.
 * It is held so the square never shows anything but the image.
 */
export const clampPan = (pan: Pan, viewport: number, image: ImageSize, zoom: number): Pan => {
  const scale = scaleOf(viewport, image, zoom);
  const limitX = Math.max(0, (image.width * scale - viewport) / 2);
  const limitY = Math.max(0, (image.height * scale - viewport) / 2);

  return {
    x: Math.min(limitX, Math.max(-limitX, pan.x)),
    y: Math.min(limitY, Math.max(-limitY, pan.y)),
  };
};

/** The square of the original image that the crop area shows, in image pixels. */
export const sourceRect = (pan: Pan, viewport: number, image: ImageSize, zoom: number): Rect => {
  const scale = scaleOf(viewport, image, zoom);
  const held = clampPan(pan, viewport, image, zoom);
  const side = viewport / scale;

  return {
    height: side,
    width: side,
    x: image.width / 2 - held.x / scale - side / 2,
    y: image.height / 2 - held.y / scale - side / 2,
  };
};

/** Safari answers a webp request with a PNG: that is the cue to ask for a JPEG instead. */
export const needsJpegFallback = (blob: Blob | null) => blob?.type !== EXPORT_FORMATS.webp.type;
