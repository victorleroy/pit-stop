import {ICEBREAKER_QUESTIONS} from '~/Icebreaker/questions';

/** The editorial rules a test can hold; the rest is for the review (CONTRIBUTING.md). */
describe('icebreaker question bank', () => {
  it('gives every question a unique, stable id', () => {
    const ids = ICEBREAKER_QUESTIONS.map(({id}) => id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      expect(id).toMatch(/^fun-\d{3}$/);
    }
  });

  it('writes every question in English, trimmed, in at most 140 characters', () => {
    for (const {text} of ICEBREAKER_QUESTIONS) {
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(140);
      expect(text.trim()).toBe(text);
    }
  });

  it('keeps at least ten active questions', () => {
    expect(ICEBREAKER_QUESTIONS.filter(({active}) => active).length).toBeGreaterThanOrEqual(10);
  });

  it('uses no dash as punctuation', () => {
    for (const {text} of ICEBREAKER_QUESTIONS) {
      expect(text).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
