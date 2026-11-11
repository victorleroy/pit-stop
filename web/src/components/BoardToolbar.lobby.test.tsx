// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Board} from '@/api/types';
import {BoardToolbar} from '@/components/BoardToolbar';
import {ToastProvider} from '@/contexts/ToastContext';

vi.mock('@/api/teams', () => ({fetchTeams: vi.fn().mockResolvedValue([])}));

const board = (overrides: Partial<Board> = {}) =>
  ({
    actions: [],
    carriedOverActions: [],
    columns: [],
    facilitatorId: 'f',
    icebreaker: null,
    isFacilitator: true,
    maxVotes: 3,
    myNotesRevealed: false,
    myVotesLeft: 3,
    phase: 'LOBBY',
    teamId: 't1',
    template: null,
    timer: {state: 'IDLE'},
    ...overrides,
  }) as Board;

const renderToolbar = (value: Board, onPhaseChange = vi.fn(), onTakeFacilitation = vi.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
      <ToastProvider>
        <MemoryRouter>
    <BoardToolbar
      authorFilter={[]}
      board={value}
      isAddingColumn={false}
      isBusy={false}
      isTimerBusy={false}
      onAddColumn={vi.fn()}
      onAddingColumnChange={vi.fn()}
      onAuthorFilterChange={vi.fn()}
      onHide={vi.fn()}
      onMaxVotesChange={vi.fn()}
      onOpenActions={vi.fn()}
      onPhaseChange={onPhaseChange}
      onReveal={vi.fn()}
      onTakeFacilitation={onTakeFacilitation}
      onTimer={vi.fn()}
      openActionCount={0}
      receivedAt={Date.now()}
    />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

describe('BoardToolbar in the waiting room', () => {
  afterEach(cleanup);

  it('keeps the waiting room out of the stepper', () => {
    renderToolbar(board());

    expect(screen.queryByText('Waiting room')).toBeNull();
    expect(screen.getByText('Brainstorm')).toBeTruthy();
    expect(screen.getByText(/The retro has not started yet\. Say hello while everyone arrives\./)).toBeTruthy();
  });

  it('starts the retro on brainstorm, even with no column yet', () => {
    const onPhaseChange = vi.fn();
    renderToolbar(board(), onPhaseChange);

    expect(screen.queryByRole('button', {name: /Move on to/})).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Start the retro'}));

    expect(onPhaseChange).toHaveBeenCalledWith('BRAINSTORM');
  });

  it('lets the facilitator add a column', () => {
    renderToolbar(board());

    expect(screen.getByRole('button', {name: 'Add a column'})).toBeTruthy();
  });

  it('lets a participant take over, and not start', () => {
    const onTakeFacilitation = vi.fn();
    renderToolbar(board({isFacilitator: false}), vi.fn(), onTakeFacilitation);

    fireEvent.click(screen.getByRole('button', {name: 'Take over facilitation'}));

    expect(onTakeFacilitation).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', {name: 'Start the retro'})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Add a column'})).toBeNull();
  });
});

describe('BoardToolbar and the icebreaker', () => {
  afterEach(cleanup);

  const icebreaker = {answeredCount: 0, answers: [], answersRevealed: false, question: null, state: 'ASKED'} as Board['icebreaker'];

  it('opens the stepper with the icebreaker when the retro has one', () => {
    renderToolbar(board({icebreaker, phase: 'BRAINSTORM'}));

    const first = screen.getByText('Icebreaker');
    const second = screen.getByText('Brainstorm');

    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens the stepper with the icebreaker while it is the current phase', () => {
    renderToolbar(board({icebreaker, phase: 'ICEBREAKER'}));

    expect(screen.getByText('Icebreaker')).toBeTruthy();
    expect(screen.getByText(/Answer in one line, or out loud\./)).toBeTruthy();
  });

  it('starts the stepper with brainstorm when there is no icebreaker', () => {
    renderToolbar(board({phase: 'BRAINSTORM'}));

    expect(screen.queryByText('Icebreaker')).toBeNull();
    expect(screen.getByText('Brainstorm')).toBeTruthy();
  });

  it('moves on from the icebreaker to brainstorm even with no column', () => {
    const onPhaseChange = vi.fn();
    renderToolbar(board({icebreaker, phase: 'ICEBREAKER'}), onPhaseChange);

    const button = screen.getByRole('button', {name: 'Move on to Brainstorm'}) as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    expect(onPhaseChange).toHaveBeenCalledWith('BRAINSTORM');
  });

  const review = (enabled: boolean, count: number) =>
    ({enabled, focusActionId: null, items: Array.from({length: count}, () => ({}))}) as unknown as Board['review'];

  it('moves on from the icebreaker to the review while actions wait for it', () => {
    const onPhaseChange = vi.fn();
    renderToolbar(board({icebreaker, phase: 'ICEBREAKER', review: review(true, 1)}), onPhaseChange);

    fireEvent.click(screen.getByRole('button', {name: 'Move on to Review'}));

    expect(onPhaseChange).toHaveBeenCalledWith('REVIEW');
  });

  it('starts the retro on the review when there is no icebreaker', () => {
    const onPhaseChange = vi.fn();
    renderToolbar(board({review: review(true, 2)}), onPhaseChange);

    fireEvent.click(screen.getByRole('button', {name: 'Start the retro'}));

    expect(onPhaseChange).toHaveBeenCalledWith('REVIEW');
  });

  it('keeps the review out of the stepper when it is off or empty, but not while in it', () => {
    renderToolbar(board({phase: 'BRAINSTORM', review: review(false, 2)}));
    expect(screen.queryByText('Review')).toBeNull();
    cleanup();

    renderToolbar(board({phase: 'BRAINSTORM', review: review(true, 0)}));
    expect(screen.queryByText('Review')).toBeNull();
    cleanup();

    renderToolbar(board({phase: 'REVIEW', review: review(true, 0)}));
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText(/Did we do what we decided\?/)).toBeTruthy();
  });

  it('puts the review between the icebreaker and the brainstorm', () => {
    renderToolbar(board({icebreaker, phase: 'BRAINSTORM', review: review(true, 1)}));

    const order = ['Icebreaker', 'Review', 'Brainstorm'].map((label) => screen.getByText(label));

    expect(order[0]!.compareDocumentPosition(order[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1]!.compareDocumentPosition(order[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('starts brainstorming from the review, even with no column', () => {
    const onPhaseChange = vi.fn();
    renderToolbar(board({phase: 'REVIEW', review: review(true, 1)}), onPhaseChange);

    fireEvent.click(screen.getByRole('button', {name: 'Start brainstorming'}));

    expect(onPhaseChange).toHaveBeenCalledWith('BRAINSTORM');
  });

  it('still needs a column to move on from brainstorm', () => {
    renderToolbar(board({icebreaker, phase: 'BRAINSTORM'}));

    expect((screen.getByRole('button', {name: 'Move on to Share'}) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lets the facilitator go back to the icebreaker from a later phase', () => {
    const onPhaseChange = vi.fn();
    renderToolbar(board({icebreaker, phase: 'SHARE'}), onPhaseChange);

    fireEvent.click(screen.getByText('Icebreaker'));

    expect(onPhaseChange).toHaveBeenCalledWith('ICEBREAKER');
  });
});
