import {describe, expect, it} from 'vitest';
import {moveColumn} from '@/utils/columnOrder';

describe('moveColumn', () => {
  it('swaps a column with its neighbour', () => {
    expect(moveColumn(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveColumn(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the order alone past either end', () => {
    expect(moveColumn(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveColumn(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
