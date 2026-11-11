// @vitest-environment jsdom
import {act, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {DieRoll} from '@/api/types';
import {SPIN_MS, useDiceSpin} from '@/hooks/useDiceSpin';

const alice = {name: 'Alice', userId: 'alice', value: 4};
const bob = {name: 'Bob', userId: 'bob', value: 6};

const renderSpin = (rolls: DieRoll[], reducedMotion = false) =>
  renderHook(({current}) => useDiceSpin(current, {reducedMotion}), {initialProps: {current: rolls}});

describe('useDiceSpin', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps a new roll out of the order until its die stops spinning', () => {
    const {rerender, result} = renderSpin([]);

    rerender({current: [bob]});

    expect(result.current.settled).toEqual([]);
    expect(result.current.spinningIds).toEqual(['bob']);

    act(() => vi.advanceTimersByTime(SPIN_MS - 1));
    expect(result.current.settled).toEqual([]);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.settled).toEqual([bob]);
    expect(result.current.spinningIds).toEqual([]);
  });

  it('spins my die from the click and keeps the value received meanwhile hidden', () => {
    const {rerender, result} = renderSpin([]);

    act(() => result.current.spin('alice'));
    act(() => vi.advanceTimersByTime(1000));
    rerender({current: [alice]});

    expect(result.current.isSpinning('alice')).toBe(true);
    expect(result.current.settled).toEqual([]);

    act(() => vi.advanceTimersByTime(SPIN_MS - 1000));
    expect(result.current.settled).toEqual([alice]);
  });

  it('stops my die when the roll fails', () => {
    const {result} = renderSpin([]);

    act(() => result.current.spin('alice'));
    act(() => result.current.stop('alice'));

    expect(result.current.isSpinning('alice')).toBe(false);
  });

  it('shows the dice of a late join snapshot at once', () => {
    const {rerender, result} = renderSpin([]);

    rerender({current: [bob, alice]});

    expect(result.current.spinningIds).toEqual([]);
    expect(result.current.settled).toEqual([bob, alice]);
  });

  it('shows the result directly when motion is reduced', () => {
    const {rerender, result} = renderSpin([], true);

    act(() => result.current.spin('alice'));
    rerender({current: [alice]});

    expect(result.current.spinningIds).toEqual([]);
    expect(result.current.settled).toEqual([alice]);
  });

  it('drops every spin on a reset', () => {
    const {rerender, result} = renderSpin([]);

    rerender({current: [bob]});
    rerender({current: []});

    expect(result.current.spinningIds).toEqual([]);
  });
});
