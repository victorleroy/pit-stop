// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest';
import {readZoom, saveZoom, stepZoom} from '@/utils/boardZoom';

describe('stepZoom', () => {
  it('moves one level at a time and stops at 50% and 100%', () => {
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(0.6, -1)).toBe(0.5);
    expect(stepZoom(0.5, -1)).toBe(0.5);
    expect(stepZoom(0.9, 1)).toBe(1);
    expect(stepZoom(1, 1)).toBe(1);
  });
});

describe('readZoom / saveZoom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('remembers the zoom of this viewer', () => {
    saveZoom(0.7);
    expect(readZoom()).toBe(0.7);
  });

  it('falls back to 100% on a missing or unknown value', () => {
    expect(readZoom()).toBe(1);
    window.localStorage.setItem('pit-stop.board-zoom', '3');
    expect(readZoom()).toBe(1);
  });

  it('survives a storage that refuses access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => saveZoom(0.5)).not.toThrow();
    expect(readZoom()).toBe(1);
  });
});
