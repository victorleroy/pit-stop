// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Icebreaker} from '@/api/types';
import {IcebreakerPreview} from '@/components/icebreaker/IcebreakerPreview';

const waiting: Icebreaker = {
  answeredCount: 0,
  answers: [],
  answersRevealed: false,
  question: {source: 'CUSTOM', text: 'Best lunch this week?'},
  state: 'WAITING',
};

const renderPreview = (
  props: Partial<Parameters<typeof IcebreakerPreview>[0]> = {},
  handlers = {onCustom: vi.fn(), onDraw: vi.fn()},
) =>
  render(
    <IcebreakerPreview
      icebreaker={waiting}
      isBusy={false}
      isFacilitator
      {...handlers}
      {...props}
    />,
  );

describe('IcebreakerPreview', () => {
  afterEach(cleanup);

  it('shows a participant nothing of the icebreaker', () => {
    const {container} = renderPreview({isFacilitator: false});

    expect(container.textContent).toBe('');
    expect(screen.queryByText('Best lunch this week?')).toBeNull();
  });

  it('shows the facilitator the question and who can see it', () => {
    renderPreview();

    expect(screen.getByRole('heading', {name: 'Icebreaker'})).toBeTruthy();
    expect(screen.getByText('Best lunch this week?')).toBeTruthy();
    expect(screen.getByText('Only you can see this')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Another question'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Write my own'})).toBeTruthy();
  });

  it('draws another question on request', () => {
    const onDraw = vi.fn();
    renderPreview({}, {onCustom: vi.fn(), onDraw});

    fireEvent.click(screen.getByRole('button', {name: 'Another question'}));

    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  it('sends the question the facilitator wrote, trimmed', () => {
    const onCustom = vi.fn();
    renderPreview({}, {onCustom, onDraw: vi.fn()});

    fireEvent.click(screen.getByRole('button', {name: 'Write my own'}));
    const field = screen.getByLabelText('Your question');
    expect((screen.getByRole('button', {name: 'Use this question'}) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(field, {target: {value: '  Favourite song?  '}});
    expect(screen.getByText('19/200')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Use this question'}));

    expect(onCustom).toHaveBeenCalledWith('Favourite song?');
  });

  it('offers a single button when there is no question yet', () => {
    const onDraw = vi.fn();
    renderPreview({icebreaker: null}, {onCustom: vi.fn(), onDraw});

    expect(screen.queryByText('Only you can see this')).toBeNull();
    expect(screen.queryByRole('button', {name: 'Another question'})).toBeNull();

    fireEvent.click(screen.getByRole('button', {name: 'Add an icebreaker'}));

    expect(onDraw).toHaveBeenCalledTimes(1);
  });
});
