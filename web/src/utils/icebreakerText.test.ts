import {describe, expect, it} from 'vitest';
import type {IcebreakerQuestion} from '@/api/types';
import {pickIcebreakerText} from '@/utils/icebreakerText';

const bank: IcebreakerQuestion = {
  category: 'FUN',
  id: 'fun-1',
  source: 'BANK',
  text: {en: 'Which superpower would you pick?', fr: 'Quel super-pouvoir choisirais-tu ?'},
};

describe('pickIcebreakerText', () => {
  it('speaks French to a French browser', () => {
    expect(pickIcebreakerText(bank, 'fr-FR')).toBe('Quel super-pouvoir choisirais-tu ?');
    expect(pickIcebreakerText(bank, 'fr')).toBe('Quel super-pouvoir choisirais-tu ?');
  });

  it('falls back to English for every other language', () => {
    expect(pickIcebreakerText(bank, 'en-US')).toBe('Which superpower would you pick?');
    expect(pickIcebreakerText(bank, 'de')).toBe('Which superpower would you pick?');
  });

  it('shows a custom question as it was written', () => {
    expect(pickIcebreakerText({source: 'CUSTOM', text: 'Best lunch this week?'}, 'fr-FR')).toBe(
      'Best lunch this week?',
    );
  });
});
