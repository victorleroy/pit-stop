import {describe, expect, it} from 'vitest';
import type {Action} from '@/api/types';
import {countOpenActions} from '@/utils/openActions';

const action = (id: string, status: Action['status']) =>
  ({id, retroId: 'r', retroTitle: 'R', status, text: id}) as Action;

describe('countOpenActions', () => {
  it('counts open actions of this retro and carried over, once each', () => {
    const board = {
      actions: [action('a', 'OPEN'), action('b', 'DONE'), action('c', 'DROPPED')],
      carriedOverActions: [action('d', 'OPEN'), action('a', 'OPEN')],
    };

    expect(countOpenActions(board)).toBe(2);
  });

  it('is zero on a board without actions', () => {
    expect(countOpenActions({actions: [], carriedOverActions: []})).toBe(0);
  });
});
