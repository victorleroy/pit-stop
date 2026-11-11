// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Icebreaker, IcebreakerAnswer} from '@/api/types';
import {IcebreakerStage} from '@/components/icebreaker/IcebreakerStage';

const answer = (id: string, name: string, text: string, mine = false): IcebreakerAnswer => ({
  author: {id, name},
  mine,
  text,
});

const asked = (overrides: Partial<Icebreaker> = {}): Icebreaker => ({
  answeredCount: 0,
  answers: [],
  answersRevealed: false,
  question: {
    category: 'FUN',
    id: 'fun-1',
    source: 'BANK',
    text: {en: 'Which superpower would you pick?', fr: 'Quel super-pouvoir ?'},
  },
  state: 'ASKED',
  ...overrides,
});

const handlers = () => ({
  onAnswer: vi.fn(),
  onCustom: vi.fn(),
  onDraw: vi.fn(),
  onHide: vi.fn(),
  onRemoveAnswer: vi.fn(),
  onReveal: vi.fn(),
});

const renderStage = (
  icebreaker: Icebreaker,
  props: {isFacilitator?: boolean; participants?: {name: string; userId: string}[]} = {},
  actions = handlers(),
) => {
  render(
    <IcebreakerStage
      icebreaker={icebreaker}
      isBusy={false}
      isFacilitator={props.isFacilitator ?? false}
      participants={props.participants ?? []}
      {...actions}
    />,
  );

  return actions;
};

describe('IcebreakerStage', () => {
  afterEach(cleanup);

  it('asks the question in a heading', () => {
    renderStage(asked());

    expect(screen.getByRole('heading', {level: 2, name: 'Which superpower would you pick?'})).toBeTruthy();
  });

  it('asks a question written by the facilitator as written', () => {
    renderStage(asked({question: {source: 'CUSTOM', text: 'Best lunch this week?'}}));

    expect(screen.getByRole('heading', {name: 'Best lunch this week?'})).toBeTruthy();
  });

  it('sends the answer with Enter, trimmed and counted', () => {
    const {onAnswer} = renderStage(asked());
    const field = screen.getByLabelText('Your answer') as HTMLInputElement;

    expect(field.getAttribute('maxlength')).toBe('140');
    fireEvent.change(field, {target: {value: '  Invisibility  '}});
    expect(screen.getByText('16/140')).toBeTruthy();
    fireEvent.keyDown(field, {key: 'Enter'});

    expect(onAnswer).toHaveBeenCalledWith('Invisibility');
  });

  it('does not send an empty answer', () => {
    const {onAnswer} = renderStage(asked());

    fireEvent.keyDown(screen.getByLabelText('Your answer'), {key: 'Enter'});

    expect(onAnswer).not.toHaveBeenCalled();
    expect((screen.getByRole('button', {name: 'Send'}) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reads the own answer back, to edit or to remove', () => {
    const {onAnswer, onRemoveAnswer} = renderStage(
      asked({answers: [answer('a', 'Ada', 'Flying', true)]}),
    );

    expect(screen.queryByLabelText('Your answer')).toBeNull();
    expect(screen.getByText('Flying')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', {name: 'Remove'}));
    expect(onRemoveAnswer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', {name: 'Edit'}));
    const field = screen.getByLabelText('Your answer') as HTMLInputElement;
    expect(field.value).toBe('Flying');
    fireEvent.change(field, {target: {value: 'Teleporting'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));

    expect(onAnswer).toHaveBeenCalledWith('Teleporting');
  });

  it('counts the people here and the people who answered once each', () => {
    renderStage(
      asked({answers: [answer('a', 'Ada', '', true), answer('c', 'Cy', '')]}),
      {
        participants: [
          {name: 'Ada', userId: 'a'},
          {name: 'Bo', userId: 'b'},
        ],
      },
    );

    // Cy left the room after answering: still one of the three.
    expect(screen.getByText('2 of 3 answered').getAttribute('aria-live')).toBe('polite');
  });

  it('never counts more answers than people', () => {
    renderStage(asked({answers: [answer('a', 'Ada', '', true)]}), {participants: []});

    expect(screen.getByText('1 of 1 answered')).toBeTruthy();
  });

  it('hides the text of the others until the facilitator reveals', () => {
    renderStage(asked({answers: [answer('a', 'Ada', 'Flying', true), answer('b', 'Bo', '')]}));

    expect(screen.getByLabelText('Bo answered')).toBeTruthy();
    expect(screen.queryByLabelText('Ada answered')).toBeNull();
  });

  it('shows a grid of cards once revealed', () => {
    renderStage(
      asked({
        answers: [answer('a', 'Ada', 'Flying', true), answer('b', 'Bo', 'Invisibility')],
        answersRevealed: true,
      }),
    );

    const list = screen.getByRole('list');

    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Invisibility')).toBeTruthy();
    expect(within(list).getByText('Bo')).toBeTruthy();
    expect(screen.queryByLabelText('Bo answered')).toBeNull();
  });

  it('says answering out loud works when nobody wrote anything', () => {
    renderStage(asked());

    expect(screen.getByText('No answers yet. Answering out loud works too.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('keeps the facilitator controls from participants', () => {
    renderStage(asked());

    expect(screen.queryByRole('button', {name: 'Reveal answers'})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Another question'})).toBeNull();
  });

  it('toggles the reveal with a pressed state', () => {
    const closed = renderStage(asked(), {isFacilitator: true});
    const reveal = screen.getByRole('button', {name: 'Reveal answers'});

    expect(reveal.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(reveal);
    expect(closed.onReveal).toHaveBeenCalledTimes(1);

    cleanup();
    const open = renderStage(asked({answersRevealed: true}), {isFacilitator: true});
    const hide = screen.getByRole('button', {name: 'Hide answers'});

    expect(hide.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(hide);
    expect(open.onHide).toHaveBeenCalledTimes(1);
  });

  it('changes the question at once when nobody answered yet', () => {
    const {onDraw} = renderStage(asked(), {isFacilitator: true});

    fireEvent.click(screen.getByRole('button', {name: 'Another question'}));

    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  it('asks before a new draw wipes the answers, and says how many', () => {
    const {onDraw} = renderStage(
      asked({answers: [answer('a', 'Ada', '', true), answer('b', 'Bo', '')]}),
      {isFacilitator: true},
    );

    fireEvent.click(screen.getByRole('button', {name: 'Another question'}));

    expect(onDraw).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('The 2 answers given so far will be cleared.')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', {name: 'Change the question'}));

    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  it('keeps the question when the facilitator backs out', () => {
    const {onDraw} = renderStage(asked({answers: [answer('b', 'Bo', '')]}), {isFacilitator: true});

    fireEvent.click(screen.getByRole('button', {name: 'Another question'}));
    expect(within(screen.getByRole('dialog')).getByText('The 1 answer given so far will be cleared.')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Cancel'}));

    expect(onDraw).not.toHaveBeenCalled();
  });

  it('asks before replacing the question with a written one too', () => {
    const {onCustom} = renderStage(asked({answers: [answer('b', 'Bo', '')]}), {isFacilitator: true});

    fireEvent.click(screen.getByRole('button', {name: 'Write my own'}));
    fireEvent.change(screen.getByLabelText('Your question'), {target: {value: 'Best lunch?'}});
    fireEvent.click(screen.getByRole('button', {name: 'Use this question'}));

    expect(onCustom).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Change the question'}));

    expect(onCustom).toHaveBeenCalledWith('Best lunch?');
  });
});
