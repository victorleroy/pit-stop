// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Icebreaker, IcebreakerAnswer} from '@/api/types';
import {IcebreakerStep} from '@/components/icebreaker/IcebreakerStep';

const answer = (id: string, name: string, text: string, mine = false, revealed = true): IcebreakerAnswer => ({
  author: {id, name},
  mine,
  revealed,
  text,
});

const asked = (answers: IcebreakerAnswer[] = []): Icebreaker => ({
  answeredCount: answers.length,
  answers,
  question: {id: 'q1', text: 'Which superpower would you pick?'},
  state: 'ASKED',
});

const renderStep = (
  icebreaker: Icebreaker,
  participants: {name: string; userId: string}[] = [],
  handlers = {onAnswer: vi.fn(), onHide: vi.fn(), onRemoveAnswer: vi.fn(), onReveal: vi.fn()},
) => {
  render(<IcebreakerStep icebreaker={icebreaker} isBusy={false} participants={participants} {...handlers} />);

  return handlers;
};

const zone = () => screen.getByRole('group', {name: 'Answers'});

describe('IcebreakerStep', () => {
  afterEach(cleanup);

  it('asks the question in a heading and invites to answer in the zone', () => {
    renderStep(asked());

    expect(screen.getByRole('heading', {level: 2, name: 'Which superpower would you pick?'})).toBeTruthy();
    expect(screen.getByText(/Click here to add your answer/)).toBeTruthy();
    expect(screen.getByText(/Answering out loud works too/)).toBeTruthy();
  });

  it('opens my post-it editor on a click in the zone and sends the trimmed text on Enter', () => {
    const {onAnswer} = renderStep(asked());

    fireEvent.click(zone());
    const field = screen.getByRole('textbox', {name: 'Your answer'});
    fireEvent.change(field, {target: {value: '  Flying  '}});
    expect(screen.getByText('10/140')).toBeTruthy();
    fireEvent.keyDown(field, {key: 'Enter'});

    expect(onAnswer).toHaveBeenCalledWith('Flying');
  });

  it('caps the answer at 140 characters', () => {
    renderStep(asked());

    fireEvent.click(zone());

    expect(screen.getByRole('textbox', {name: 'Your answer'}).getAttribute('maxlength')).toBe('140');
  });

  it('cancels with Escape without sending', () => {
    const {onAnswer} = renderStep(asked());

    fireEvent.click(zone());
    const field = screen.getByRole('textbox', {name: 'Your answer'});
    fireEvent.change(field, {target: {value: 'Flying'}});
    fireEvent.keyDown(field, {key: 'Escape'});

    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opens a single editor however many times the zone is clicked', () => {
    renderStep(asked());

    fireEvent.click(zone());
    fireEvent.click(zone());

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('edits mine from a click in the zone once I have one, and drops the hint', () => {
    renderStep(asked([answer('f', 'Fay', 'Flying', true)]));

    expect(screen.queryByText(/Click here to add your answer/)).toBeNull();
    fireEvent.click(zone());

    expect((screen.getByRole('textbox', {name: 'Your answer'}) as HTMLTextAreaElement).value).toBe('Flying');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('edits mine from a click on its text', () => {
    const {onAnswer} = renderStep(asked([answer('f', 'Fay', 'Flying', true)]));

    fireEvent.click(screen.getByText('Flying'));
    const field = screen.getByRole('textbox', {name: 'Your answer'});
    fireEvent.change(field, {target: {value: 'Invisible'}});
    fireEvent.keyDown(field, {key: 'Enter'});

    expect(onAnswer).toHaveBeenCalledWith('Invisible');
  });

  it('keeps editing, unsaved, on a click in the empty part of the zone', () => {
    const {onAnswer} = renderStep(asked([answer('f', 'Fay', 'Flying', true)]));

    fireEvent.click(screen.getByText('Flying'));
    const field = screen.getByRole('textbox', {name: 'Your answer'});
    fireEvent.change(field, {target: {value: 'Invisible'}});
    // A browser blurs the field on mousedown unless the zone prevents it.
    if (fireEvent.mouseDown(zone())) fireEvent.blur(field);
    fireEvent.click(zone());

    expect(onAnswer).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox', {name: 'Your answer'}) as HTMLTextAreaElement).value).toBe('Invisible');
  });

  it('removes my post-it when an empty text is validated', () => {
    const {onAnswer, onRemoveAnswer} = renderStep(asked([answer('f', 'Fay', 'Flying', true)]));

    fireEvent.click(screen.getByText('Flying'));
    const field = screen.getByRole('textbox', {name: 'Your answer'});
    fireEvent.change(field, {target: {value: '   '}});
    fireEvent.keyDown(field, {key: 'Enter'});

    expect(onRemoveAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('shows or hides my post-it with the eye', () => {
    const {onHide, onReveal} = renderStep(asked([answer('f', 'Fay', 'Flying', true, false)]));

    const show = screen.getByRole('button', {name: 'Show my answer'});
    expect(show.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(show);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).toBeNull();

    cleanup();
    renderStep(asked([answer('f', 'Fay', 'Flying', true, true)]), [], {
      onAnswer: vi.fn(),
      onHide,
      onRemoveAnswer: vi.fn(),
      onReveal,
    });
    const hide = screen.getByRole('button', {name: 'Hide my answer'});
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(hide);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('shows others as a withheld note when hidden, with the author and no text', () => {
    renderStep(asked([answer('b', 'Bea', '', false, false), answer('c', 'Cam', 'Pasta')]));

    const withheld = screen.getByLabelText('Bea answered');
    expect(within(withheld).getByText('Bea')).toBeTruthy();
    expect(withheld.textContent).not.toContain('Pasta');
    expect(screen.getByText('Pasta')).toBeTruthy();
    expect(screen.queryByLabelText('Cam answered')).toBeNull();
    expect(screen.queryByRole('button', {name: /my answer/})).toBeNull();
  });

  it('counts the answers against whoever is here or has answered', () => {
    renderStep(asked([answer('b', 'Bea', 'Pasta'), answer('z', 'Zed', 'Tea')]), [
      {name: 'Bea', userId: 'b'},
      {name: 'Cam', userId: 'c'},
    ]);

    expect(screen.getByText('2 of 3 answered')).toBeTruthy();
  });
});
