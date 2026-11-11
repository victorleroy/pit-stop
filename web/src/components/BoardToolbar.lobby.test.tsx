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
