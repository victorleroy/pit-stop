import {ICEBREAKER_CATEGORIES, ICEBREAKER_QUESTIONS} from '~/Icebreaker/questions';

/** The editorial rules a test can hold; the rest is for the review (CONTRIBUTING.md). */
describe('icebreaker question bank', () => {
  it('gives every question a unique id that matches its category', () => {
    const ids = ICEBREAKER_QUESTIONS.map(({id}) => id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const question of ICEBREAKER_QUESTIONS) {
      expect(question.id).toMatch(/^fun-\d{3}$/);
      expect(question.id.split('-')[0]).toBe(question.category.toLowerCase());
    }
  });

  it('writes every question in both languages, trimmed, in at most 140 characters', () => {
    for (const {text} of ICEBREAKER_QUESTIONS) {
      for (const value of [text.en, text.fr]) {
        expect(value.length).toBeGreaterThan(0);
        expect(value.length).toBeLessThanOrEqual(140);
        expect(value.trim()).toBe(value);
      }
    }
  });

  it('keeps at least ten active questions per category', () => {
    for (const category of ICEBREAKER_CATEGORIES) {
      const active = ICEBREAKER_QUESTIONS.filter(
        (question) => question.category === category && question.active,
      );

      expect(active.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('uses no dash as punctuation', () => {
    for (const {text} of ICEBREAKER_QUESTIONS) {
      expect(`${text.en} ${text.fr}`).not.toMatch(/[–—]/);
    }
  });
});
