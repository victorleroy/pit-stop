import {describe, expect, it} from 'vitest';
import type {ImageSize, Pan} from '@/utils/avatarImage';
import {clampPan, MAX_ZOOM, needsJpegFallback, sourceRect as rawSourceRect} from '@/utils/avatarImage';

const VIEWPORT = 256;
const NO_PAN = {x: 0, y: 0};

// Screen scales are not exact in floating point: two decimals is plenty for a crop.
const sourceRect = (pan: Pan, viewport: number, image: ImageSize, zoom: number) => {
  const rect = rawSourceRect(pan, viewport, image, zoom);

  return {
    height: Math.round(rect.height * 100) / 100 + 0,
    width: Math.round(rect.width * 100) / 100 + 0,
    x: Math.round(rect.x * 100) / 100 + 0,
    y: Math.round(rect.y * 100) / 100 + 0,
  };
};

describe('sourceRect', () => {
  it('takes the centred square of a landscape image at 1x', () => {
    expect(sourceRect(NO_PAN, VIEWPORT, {height: 500, width: 1000}, 1)).toEqual({
      height: 500,
      width: 500,
      x: 250,
      y: 0,
    });
  });

  it('takes the centred square of a portrait image at 1x', () => {
    expect(sourceRect(NO_PAN, VIEWPORT, {height: 1000, width: 500}, 1)).toEqual({
      height: 500,
      width: 500,
      x: 0,
      y: 250,
    });
  });

  it('shows a quarter of the side at 4x', () => {
    expect(sourceRect(NO_PAN, VIEWPORT, {height: 800, width: 800}, MAX_ZOOM)).toEqual({
      height: 200,
      width: 200,
      x: 300,
      y: 300,
    });
  });

  it('moves the visible square against the pan, in image pixels', () => {
    const rect = sourceRect({x: 32, y: -16}, VIEWPORT, {height: 800, width: 800}, 2);

    expect(rect).toEqual({height: 400, width: 400, x: 200 - 50, y: 200 + 25});
  });

  it('never leaves the image, whatever the pan asked for', () => {
    const rect = sourceRect({x: 9999, y: -9999}, VIEWPORT, {height: 800, width: 1200}, 2);

    expect(rect.x).toBe(0);
    expect(rect.y + rect.height).toBe(800);
  });
});

describe('clampPan', () => {
  it('allows no movement along the side that just fits at 1x', () => {
    expect(clampPan({x: 500, y: 50}, VIEWPORT, {height: 500, width: 1000}, 1)).toEqual({
      x: 128,
      y: 0,
    });
  });

  it('allows half of what overflows at 4x', () => {
    expect(clampPan({x: 9999, y: -9999}, VIEWPORT, {height: 400, width: 400}, MAX_ZOOM)).toEqual({
      x: 384,
      y: -384,
    });
  });

  it('keeps a pan that is already inside', () => {
    expect(clampPan({x: 10, y: -20}, VIEWPORT, {height: 400, width: 400}, 2)).toEqual({
      x: 10,
      y: -20,
    });
  });
});

describe('needsJpegFallback', () => {
  it('keeps webp when the browser produced it', () => {
    expect(needsJpegFallback(new Blob(['x'], {type: 'image/webp'}))).toBe(false);
  });

  it('falls back to jpeg when the browser answered with something else', () => {
    expect(needsJpegFallback(new Blob(['x'], {type: 'image/png'}))).toBe(true);
    expect(needsJpegFallback(null)).toBe(true);
  });
});
