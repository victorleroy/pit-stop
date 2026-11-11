import {describe, expect, it} from 'vitest';
import {COLUMN_EDIT_PHASES, OPENING_PHASES, nextOpeningPhase} from '@/utils/phases';

const review = {enabled: true, items: [{}]};

describe('nextOpeningPhase', () => {
  it('goes straight to brainstorm when nothing opens the retro', () => {
    expect(nextOpeningPhase({phase: 'LOBBY'})).toBe('BRAINSTORM');
    expect(nextOpeningPhase({icebreaker: null, phase: 'LOBBY', review: {enabled: true, items: []}})).toBe('BRAINSTORM');
    expect(nextOpeningPhase({icebreaker: null, phase: 'LOBBY', review: {enabled: false, items: [{}]}})).toBe('BRAINSTORM');
  });

  it('starts with the icebreaker when there is one', () => {
    expect(nextOpeningPhase({icebreaker: {}, phase: 'LOBBY', review})).toBe('ICEBREAKER');
    expect(nextOpeningPhase({icebreaker: {}, phase: 'LOBBY'})).toBe('ICEBREAKER');
  });

  it('starts with the review when there is no icebreaker', () => {
    expect(nextOpeningPhase({icebreaker: null, phase: 'LOBBY', review})).toBe('REVIEW');
  });

  it('skips the icebreaker once past it', () => {
    expect(nextOpeningPhase({icebreaker: {}, phase: 'ICEBREAKER', review})).toBe('REVIEW');
    expect(nextOpeningPhase({icebreaker: {}, phase: 'ICEBREAKER'})).toBe('BRAINSTORM');
    expect(nextOpeningPhase({icebreaker: {}, phase: 'REVIEW', review})).toBe('BRAINSTORM');
  });
});

describe('phase lists', () => {
  it('lists the opening phases in order', () => {
    expect(OPENING_PHASES).toEqual(['LOBBY', 'ICEBREAKER', 'REVIEW']);
  });

  it('lets columns change in the waiting room and while brainstorming', () => {
    expect(COLUMN_EDIT_PHASES).toEqual(['LOBBY', 'BRAINSTORM']);
  });
});
