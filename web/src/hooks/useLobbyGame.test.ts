// @vitest-environment jsdom
import {act, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {GameEvent} from '@/api/types';
import {PENDING_TIMEOUT_MS, podiumMessage, useLobbyGame, wheelKey} from '@/hooks/useLobbyGame';

const car = {id: 7, lane: 1 as const, livery: 3, spawnAt: Date.now(), speed: 0.2};

const state = (overrides: Partial<Extract<GameEvent, {type: 'game.state'}>> = {}): GameEvent => ({
  cars: [{...car, taken: {rear: 'z'}}],
  scores: [{name: 'Zed', points: 1, userId: 'z'}],
  serverNow: Date.now(),
  teamStops: 0,
  type: 'game.state',
  ...overrides,
});

const hit = (userId: string, overrides: Partial<Extract<GameEvent, {type: 'game.hit'}>> = {}): GameEvent => ({
  carId: 7,
  name: userId.toUpperCase(),
  points: 1,
  serverNow: Date.now(),
  serviced: false,
  teamStops: 0,
  type: 'game.hit',
  userId,
  wheel: 'front',
  ...overrides,
});

const setup = (options: Partial<Parameters<typeof useLobbyGame>[0]> = {}) => {
  const send = vi.fn();
  const onEnded = vi.fn();
  const initialProps: Parameters<typeof useLobbyGame>[0] = {
    enabled: true,
    isActive: true,
    isConnected: true,
    onEnded,
    send,
    userId: 'me',
    ...options,
  };
  const hook = renderHook((props: Parameters<typeof useLobbyGame>[0]) => useLobbyGame(props), {initialProps});

  return {...hook, onEnded, send};
};

describe('useLobbyGame', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('joins when the socket is open and the game is on, and leaves when it is turned off', () => {
    const {rerender, send} = setup();

    expect(send).toHaveBeenCalledWith({action: 'game.join'});

    rerender({enabled: false, isActive: true, isConnected: true, send, userId: 'me'});

    expect(send).toHaveBeenLastCalledWith({action: 'game.leave'});
  });

  it('does not join while the game is off, and joins again after a reconnection', () => {
    const {rerender, send} = setup({enabled: false});
    expect(send).not.toHaveBeenCalled();

    rerender({enabled: true, isActive: true, isConnected: true, send, userId: 'me'});
    expect(send).toHaveBeenCalledTimes(1);

    rerender({enabled: true, isActive: true, isConnected: false, send, userId: 'me'});
    rerender({enabled: true, isActive: true, isConnected: true, send, userId: 'me'});

    expect(send.mock.calls.filter(([payload]) => payload.action === 'game.join')).toHaveLength(2);
  });

  it('hydrates cars, taken wheels, scores and the team counter from game.state', () => {
    const {result} = setup();

    act(() => result.current.handleEvent(state({teamStops: 4})));

    expect(result.current.model.current.cars.get(7)).toMatchObject({lane: 1});
    expect(result.current.model.current.taken.get(wheelKey(7, 'rear'))).toBe('z');
    expect(result.current.scores).toEqual([{name: 'Zed', points: 1, userId: 'z'}]);
    expect(result.current.teamStops).toBe(4);
    expect(result.current.isFree(7, 'rear')).toBe(false);
    expect(result.current.isFree(7, 'front')).toBe(true);
  });

  it('marks a tapped wheel pending, sends the hit once, and never retries it', () => {
    const {result, send} = setup();
    act(() => result.current.handleEvent(state()));
    const effects = vi.fn();
    result.current.addEffectListener(effects);

    let first = false;
    act(() => {
      first = result.current.tap(7, 'front');
    });

    expect(first).toBe(true);
    expect(send).toHaveBeenCalledWith({action: 'game.hit', carId: 7, wheel: 'front'});
    expect(effects).toHaveBeenCalledWith(expect.objectContaining({kind: 'spark', userId: 'me'}));
    expect(result.current.model.current.pending.has(wheelKey(7, 'front'))).toBe(true);

    act(() => {
      expect(result.current.tap(7, 'front')).toBe(false);
    });
    expect(send.mock.calls.filter(([payload]) => payload.action === 'game.hit')).toHaveLength(1);
  });

  it('gives the wheel to the winner when somebody else was confirmed first', () => {
    const {result} = setup();
    act(() => result.current.handleEvent(state()));
    act(() => {
      result.current.tap(7, 'front');
    });
    const effects = vi.fn();
    result.current.addEffectListener(effects);

    act(() => result.current.handleEvent(hit('other')));

    const {model} = result.current;
    expect(model.current.pending.has(wheelKey(7, 'front'))).toBe(false);
    expect(model.current.taken.get(wheelKey(7, 'front'))).toBe('other');
    expect(effects).toHaveBeenCalledWith(expect.objectContaining({kind: 'spark', userId: 'other'}));
    expect(result.current.scores.find(({userId}) => userId === 'me')).toBeUndefined();
  });

  it('settles my own pending tap without a second spark', () => {
    const {result} = setup();
    act(() => result.current.handleEvent(state()));
    act(() => {
      result.current.tap(7, 'front');
    });
    const effects = vi.fn();
    result.current.addEffectListener(effects);

    act(() => result.current.handleEvent(hit('me', {points: 1})));

    expect(effects).not.toHaveBeenCalled();
    expect(result.current.model.current.taken.get(wheelKey(7, 'front'))).toBe('me');
  });

  it('frees a pending wheel locally after one second without confirmation', () => {
    const {result} = setup();
    act(() => result.current.handleEvent(state()));
    act(() => {
      result.current.tap(7, 'front');
    });

    act(() => {
      vi.advanceTimersByTime(PENDING_TIMEOUT_MS + 1);
    });

    expect(result.current.model.current.pending.has(wheelKey(7, 'front'))).toBe(false);
    expect(result.current.model.current.taken.has(wheelKey(7, 'front'))).toBe(false);
  });

  it('announces a service and keeps the scores ordered', () => {
    const {result} = setup();
    act(() => result.current.handleEvent(state()));
    const effects = vi.fn();
    result.current.addEffectListener(effects);

    act(() => result.current.handleEvent(hit('b', {points: 1})));
    act(() => result.current.handleEvent(hit('a', {points: 3, serviced: true, teamStops: 1, wheel: 'front'})));

    expect(effects).toHaveBeenCalledWith(expect.objectContaining({carId: 7, kind: 'serviced'}));
    expect(result.current.scores.map(({userId}) => userId)).toEqual(['a', 'z', 'b']);
    expect(result.current.teamStops).toBe(1);
  });

  it('gives the other contributor of a completed stop its bonus point', () => {
    const {result} = setup();
    act(() => result.current.handleEvent(state()));

    act(() => result.current.handleEvent(hit('b', {points: 2, serviced: true, teamStops: 1, wheel: 'front'})));

    expect(result.current.scores.map(({points, userId}) => [userId, points])).toEqual([
      ['z', 2],
      ['b', 2],
    ]);
  });

  it('asks for the podium on game.ended only when somebody scored', () => {
    const {onEnded, result} = setup();

    act(() => result.current.handleEvent({scores: [], teamStops: 0, type: 'game.ended'}));
    expect(onEnded).not.toHaveBeenCalled();

    const scores = [{name: 'Zed', points: 5, userId: 'z'}];
    act(() => result.current.handleEvent({scores, teamStops: 2, type: 'game.ended'}));

    expect(onEnded).toHaveBeenCalledWith({scores, teamStops: 2});
  });

  it('words the podium', () => {
    expect(podiumMessage([{name: 'Zed', points: 5, userId: 'z'}], 2)).toBe('Pit stop record: 2 stops · 1st Zed 5');
  });
});
