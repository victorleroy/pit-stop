// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AvatarCropDialog} from '@/components/AvatarCropDialog';

const renderDialog = (onCancel = vi.fn(), onConfirm = vi.fn()) => {
  render(
    <AvatarCropDialog
      file={new File(['x'], 'me.png', {type: 'image/png'})}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );

  return {onCancel, onConfirm};
};

// jsdom decodes nothing: tell the image how big it is, as the browser would on load.
const loadImage = (width: number, height: number) => {
  const image = document.querySelector('img') as HTMLImageElement;

  Object.defineProperty(image, 'naturalWidth', {configurable: true, value: width});
  Object.defineProperty(image, 'naturalHeight', {configurable: true, value: height});
  fireEvent.load(image);

  return image;
};

const zoomTo = (value: number) =>
  fireEvent.change(screen.getByRole('slider', {name: 'Zoom'}), {target: {value: String(value)}});

const frame = () => screen.getByRole('group', {name: /Photo position/});

describe('AvatarCropDialog', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('cannot be confirmed before the image is read', () => {
    renderDialog();

    expect((screen.getByRole('button', {name: 'Use this photo'}) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('zooms with the slider', () => {
    renderDialog();
    const image = loadImage(400, 400);

    expect(image.style.width).toBe('256px');
    zoomTo(2);
    expect(image.style.width).toBe('512px');
  });

  it('moves the photo with the arrow keys, 4 px at a time and 20 with Shift', () => {
    renderDialog();
    const image = loadImage(400, 400);

    zoomTo(2);
    expect(image.style.left).toBe('-128px');

    fireEvent.keyDown(frame(), {key: 'ArrowRight'});
    expect(image.style.left).toBe('-124px');

    fireEvent.keyDown(frame(), {key: 'ArrowLeft', shiftKey: true});
    expect(image.style.left).toBe('-144px');

    fireEvent.keyDown(frame(), {key: 'ArrowDown'});
    expect(image.style.top).toBe('-124px');
  });

  it('keeps the photo from leaving the square', () => {
    renderDialog();
    const image = loadImage(400, 400);

    fireEvent.keyDown(frame(), {key: 'ArrowRight', shiftKey: true});
    expect(image.style.left).toBe('0px');

    zoomTo(2);
    for (let press = 0; press < 20; press += 1) {
      fireEvent.keyDown(frame(), {key: 'ArrowRight', shiftKey: true});
    }
    expect(image.style.left).toBe('0px');
  });

  it('closes on Cancel without any network call', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const {onCancel, onConfirm} = renderDialog();

    loadImage(400, 400);
    fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exports a JPEG when the browser cannot produce a WebP', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) =>
      callback(new Blob(['x'], {type: type === 'image/webp' ? 'image/png' : type})),
    );
    const {onConfirm} = renderDialog();

    loadImage(400, 400);
    fireEvent.click(screen.getByRole('button', {name: 'Use this photo'}));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onConfirm.mock.calls[0][0].type).toBe('image/jpeg');
  });
});
