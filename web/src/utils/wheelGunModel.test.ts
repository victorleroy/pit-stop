import {describe, expect, it} from 'vitest';
import {
  CAR_LENGTH,
  HIT_TOLERANCE_MS,
  carX,
  hitTest,
  pickKeyboardTarget,
  wheelWindow,
  wheelX,
} from '@/utils/wheelGunModel';

const car = (overrides: Partial<{id: number; lane: 0 | 1 | 2; speed: number; spawnAt: number}> = {}) => ({
  id: 1,
  lane: 1 as const,
  livery: 0,
  spawnAt: 10_000,
  speed: 0.2,
  ...overrides,
});

describe('carX / wheelX', () => {
  it('starts one car length left of the arena and moves by speed per second', () => {
    expect(carX(car(), 10_000)).toBeCloseTo(-CAR_LENGTH);
    expect(carX(car(), 11_000)).toBeCloseTo(-CAR_LENGTH + 0.2);
    expect(carX(car(), 10_000 + (1.12 / 0.2) * 1000)).toBeCloseTo(1);
  });

  it('places the rear wheel 0.025 and the front wheel 0.095 ahead of the car x', () => {
    expect(wheelX(car(), 'rear', 10_000)).toBeCloseTo(-CAR_LENGTH + 0.025);
    expect(wheelX(car(), 'front', 10_000)).toBeCloseTo(-CAR_LENGTH + 0.095);
  });
});

describe('wheelWindow', () => {
  it('runs from wheelX = 0 minus 300 ms to wheelX = 1 plus 300 ms, as the service does', () => {
    const c = car();
    const {from, to} = wheelWindow(c, 'front');

    expect(wheelX(c, 'front', from + HIT_TOLERANCE_MS)).toBeCloseTo(0);
    expect(wheelX(c, 'front', to - HIT_TOLERANCE_MS)).toBeCloseTo(1);
  });

  it('opens later for the rear wheel than for the front one', () => {
    expect(wheelWindow(car(), 'rear').from).toBeGreaterThan(wheelWindow(car(), 'front').from);
  });
});

describe('hitTest', () => {
  const free = () => true;
  const at = 10_000 + (0.5 + CAR_LENGTH - 0.095) / 0.2 * 1000;

  it.each([
    {height: 150, width: 280},
    {height: 200, width: 360},
    {height: 280, width: 800},
  ])('gives every wheel a touch target of at least 44 px at $width x $height', (arena) => {
    const c = car();
    const centre = {x: wheelX(c, 'front', at) * arena.width, y: (1.5 * arena.height) / 3 + (arena.height / 3) * 0.2};

    expect(hitTest({arena, at, cars: [c], isFree: free, point: centre})).toEqual({carId: 1, wheel: 'front'});
    expect(hitTest({arena, at, cars: [c], isFree: free, point: {x: centre.x + 21, y: centre.y - 21}})?.wheel).toBe('front');
    expect(hitTest({arena, at, cars: [c], isFree: free, point: {x: centre.x + 60, y: centre.y}})).toBeUndefined();
  });

  it('ignores a wheel that is not free', () => {
    const arena = {height: 200, width: 400};
    const c = car();
    const centre = {x: wheelX(c, 'front', at) * arena.width, y: (1.5 * arena.height) / 3 + (arena.height / 3) * 0.2};

    expect(hitTest({arena, at, cars: [c], isFree: (_id, wheel) => wheel !== 'front', point: centre})).toBeUndefined();
  });
});

describe('pickKeyboardTarget', () => {
  const free = () => true;

  it('picks the most advanced free wheel of the lane anywhere on the track', () => {
    const behind = car({id: 1, spawnAt: 10_000});
    const ahead = car({id: 2, spawnAt: 9_500});
    const at = 10_000 + ((0.5 + CAR_LENGTH - 0.095) / 0.2) * 1000;

    expect(pickKeyboardTarget({at, cars: [behind, ahead], isFree: free, lane: 1})).toEqual({carId: 2, wheel: 'front'});
  });

  it('reaches a wheel near either end of the track', () => {
    const c = car();
    const entering = 10_000 + ((0.05 + CAR_LENGTH - 0.095) / 0.2) * 1000;
    const leaving = 10_000 + ((0.95 + CAR_LENGTH - 0.095) / 0.2) * 1000;

    expect(pickKeyboardTarget({at: entering, cars: [c], isFree: free, lane: 1})).toEqual({carId: 1, wheel: 'front'});
    expect(pickKeyboardTarget({at: leaving, cars: [c], isFree: free, lane: 1})).toEqual({carId: 1, wheel: 'front'});
  });

  it('passes over a wheel that already left the track', () => {
    const c = car();
    const at = 10_000 + ((1.02 + CAR_LENGTH - 0.095) / 0.2) * 1000;

    expect(pickKeyboardTarget({at, cars: [c], isFree: free, lane: 1})).toEqual({carId: 1, wheel: 'rear'});
  });

  it('skips taken wheels and other lanes', () => {
    const c = car();
    const at = 10_000 + ((0.5 + CAR_LENGTH - 0.095) / 0.2) * 1000;

    expect(pickKeyboardTarget({at, cars: [c], isFree: (_id, wheel) => wheel === 'rear', lane: 1})?.wheel).toBe('rear');
    expect(pickKeyboardTarget({at, cars: [c], isFree: free, lane: 0})).toBeUndefined();
  });

  it('returns nothing before any wheel of the lane is on screen', () => {
    expect(pickKeyboardTarget({at: 10_000, cars: [car()], isFree: free, lane: 1})).toBeUndefined();
  });
});
