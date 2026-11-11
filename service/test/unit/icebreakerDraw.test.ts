import {drawIcebreakerQuestion} from '~/Icebreaker/drawQuestion';
import type {IcebreakerQuestion} from '~/Icebreaker/questions';

const question = (id: string, active = true): IcebreakerQuestion => ({
  active,
  id,
  text: id,
});

const bank = [question('fun-001'), question('fun-002'), question('fun-003')];

/** Every draw of the given setup, whatever the random number: what can come out at all. */
const possible = (
  input: Partial<Parameters<typeof drawIcebreakerQuestion>[0]> & {bank?: IcebreakerQuestion[]},
): string[] => {
  const ids = new Set<string>();

  for (const value of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) {
    ids.add(
      drawIcebreakerQuestion({
        askedIds: new Set(),
        bank,
        reservedIds: new Set(),
        ...input,
        random: () => value,
      }).id,
    );
  }

  return [...ids].sort();
};

describe('drawIcebreakerQuestion', () => {
  it('never draws an asked question while an unasked one is left', () => {
    expect(possible({askedIds: new Set(['fun-001', 'fun-002'])})).toEqual(['fun-003']);
  });

  it('starts a new cycle once everything was asked', () => {
    expect(possible({askedIds: new Set(['fun-001', 'fun-002', 'fun-003'])})).toEqual([
      'fun-001',
      'fun-002',
      'fun-003',
    ]);
  });

  it('leaves the questions another waiting room holds, unless nothing else is left', () => {
    expect(possible({reservedIds: new Set(['fun-001'])})).toEqual(['fun-002', 'fun-003']);
    expect(possible({reservedIds: new Set(['fun-001', 'fun-002', 'fun-003'])})).toEqual([
      'fun-001',
      'fun-002',
      'fun-003',
    ]);
  });

  it('never draws a retired question', () => {
    expect(possible({bank: [question('fun-001', false), question('fun-002')]})).toEqual(['fun-002']);
  });

  it('gives the only question of a one-question bank back', () => {
    expect(possible({bank: [question('fun-001')]})).toEqual(['fun-001']);
  });
});
