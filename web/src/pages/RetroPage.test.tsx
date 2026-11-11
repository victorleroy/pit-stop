// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {fetchBoard} from '@/api/retros';
import {fetchTeamMembers, fetchTeams} from '@/api/teams';
import type {Board} from '@/api/types';
import {ToastProvider} from '@/contexts/ToastContext';
import {RetroPage} from '@/pages/RetroPage';

const sendCursor = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
const socket = vi.hoisted(() => ({isSubscribed: true}));

vi.mock('@/hooks/useBoardSocket', () => {
  const value = {
    cursors: [],
    hideCursor: vi.fn(),
    isConnected: true,
    isDiceSnapshot: false,
    get isSubscribed() {
      return socket.isSubscribed;
    },
    participants: [{name: 'Fay', userId: 'f'}],
    rolls: [],
    send,
    sendCursor,
  };

  return {useBoardSocket: () => value};
});
vi.mock('@/contexts/AuthContext', () => ({useAuth: () => ({user: {id: 'f', name: 'Fay'}})}));
vi.mock('@/components/lobby/WheelGun', () => ({WheelGun: () => <div data-testid="wheel-gun" />}));
vi.mock('@/components/CursorLayer', () => ({CursorLayer: () => <div data-testid="cursors" />}));
vi.mock('@/api/teams', () => ({fetchTeamMembers: vi.fn(), fetchTeams: vi.fn()}));
vi.mock('@/api/retros', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/retros')>()),
  fetchBoard: vi.fn(),
}));

const board = (isFacilitator: boolean) =>
  ({
    actions: [],
    carriedOverActions: [],
    columns: [{cards: [], id: 'c1', order: 0, title: 'Start'}],
    facilitatorId: 'f',
    id: 'r1',
    isFacilitator,
    maxVotes: 3,
    myNotesRevealed: false,
    myVotesLeft: 3,
    phase: 'LOBBY',
    review: {enabled: true, focusActionId: null, items: []},
    teamId: 't1',
    template: null,
    timer: {state: 'IDLE'},
    title: 'Sprint 12',
    voteProgress: {},
    votesRevealed: false,
  }) as unknown as Board;

const renderPage = (value: Board) => {
  vi.mocked(fetchBoard).mockResolvedValue(value);
  vi.mocked(fetchTeams).mockResolvedValue([]);
  vi.mocked(fetchTeamMembers).mockResolvedValue([
    {email: 'f@example.com', isAdmin: true, name: 'Fay', userId: 'f'},
  ]);

  render(
    <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/teams/t1/retros/r1']}>
          <Routes>
            <Route element={<RetroPage />} path="/teams/:teamId/retros/:retroId" />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

describe('RetroPage in the waiting room', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    socket.isSubscribed = true;
  });

  const gameActions = () => send.mock.calls.map(([payload]) => payload.action);

  it('shows a participant the waiting room only, without cursors or columns', async () => {
    renderPage(board(false));

    expect(await screen.findByText('Welcome to the pit stop')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText('Start', {selector: 'h3, h2, p, span'})).toBeNull();
    expect(screen.queryByTestId('cursors')).toBeNull();
  });

  it('gives the facilitator a board setup tab where the columns can be edited', async () => {
    renderPage(board(true));

    fireEvent.click(await screen.findByRole('tab', {name: 'Board setup'}));

    expect(await screen.findByText('Start')).toBeTruthy();
    expect(screen.getByRole('button', {name: /rename/i})).toBeTruthy();
    expect(screen.queryByText('Welcome to the pit stop')).toBeNull();
    expect(screen.queryByTestId('cursors')).toBeNull();
    expect(sendCursor).not.toHaveBeenCalled();
  });

  it('opens the board setup when the facilitator adds a column from the waiting room', async () => {
    renderPage(board(true));

    fireEvent.click(await screen.findByRole('button', {name: 'Add a column'}));

    expect(screen.getByRole('tab', {hidden: true, name: 'Board setup'}).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('Welcome to the pit stop')).toBeNull();
  });

  it('joins the game only once the service has confirmed the subscription', async () => {
    socket.isSubscribed = false;
    renderPage(board(false));

    expect(await screen.findByText('Welcome to the pit stop')).toBeTruthy();
    expect(gameActions()).not.toContain('game.join');
  });

  it('leaves the game while the facilitator is on the board setup tab', async () => {
    renderPage(board(true));

    await screen.findByText('Welcome to the pit stop');
    expect(gameActions()).toEqual(['game.join']);

    fireEvent.click(screen.getByRole('tab', {name: 'Board setup'}));

    expect(gameActions()).toEqual(['game.join', 'game.leave']);
  });
});
