// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {fetchBoard, updateRetro} from '@/api/retros';
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
  updateRetro: vi.fn(),
}));

const board = (isFacilitator: boolean) =>
  ({
    actions: [],
    carriedOverActions: [],
    columns: [{cards: [], id: 'c1', order: 0, title: 'Start'}],
    facilitatorId: 'f',
    icebreaker: null,
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

  it('shows a participant the waiting room over the board, without cursors or a way out', async () => {
    renderPage(board(false));

    expect(await screen.findByRole('dialog', {name: 'Welcome to the pit stop'})).toBeTruthy();
    expect(await screen.findByText('Waiting for Fay to start the retro')).toBeTruthy();
    expect(screen.queryByRole('button', {name: /Start the retro|Set up the board/})).toBeNull();
    expect(screen.queryByTestId('cursors')).toBeNull();
  });

  it('closes the waiting room for everybody once the retro has started', async () => {
    renderPage({...board(false), phase: 'BRAINSTORM'} as Board);

    expect(await screen.findByText('Start')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('starts the retro from the dialog for the facilitator', async () => {
    vi.mocked(updateRetro).mockResolvedValue({...board(true), phase: 'BRAINSTORM'} as Board);
    renderPage(board(true));

    fireEvent.click(await screen.findByRole('button', {name: 'Start the retro'}));

    await waitFor(() => expect(updateRetro).toHaveBeenCalledWith('r1', {phase: 'BRAINSTORM'}));
  });

  it('lets the facilitator step out to set up the board, and come back', async () => {
    renderPage(board(true));

    fireEvent.click(await screen.findByRole('button', {name: 'Set up the board'}));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', {name: /rename/i})).toBeTruthy();
    expect(screen.queryByTestId('cursors')).toBeNull();
    expect(sendCursor).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', {name: 'Back to the waiting room'}));

    expect(await screen.findByRole('dialog', {name: 'Welcome to the pit stop'})).toBeTruthy();
  });

  it('joins the game only once the service has confirmed the subscription', async () => {
    socket.isSubscribed = false;
    renderPage(board(false));

    expect(await screen.findByText('Welcome to the pit stop')).toBeTruthy();
    expect(gameActions()).not.toContain('game.join');
  });

  it('leaves the game while the facilitator sets the board up', async () => {
    renderPage(board(true));

    await screen.findByText('Welcome to the pit stop');
    expect(gameActions()).toEqual(['game.join']);

    fireEvent.click(screen.getByRole('button', {name: 'Set up the board'}));

    expect(gameActions()).toEqual(['game.join', 'game.leave']);
  });
});

describe('RetroPage in the icebreaker', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const icebreakerBoard = (columns: Board['columns']) =>
    ({
      ...board(true),
      columns,
      icebreaker: {
        answeredCount: 0,
        answers: [],
        answersRevealed: false,
        question: {source: 'CUSTOM', text: 'Best lunch this week?'},
        state: 'ASKED',
      },
      phase: 'ICEBREAKER',
    }) as unknown as Board;

  it('shows the question instead of the empty board, without cursors', async () => {
    renderPage(icebreakerBoard([]));

    expect(await screen.findByRole('heading', {name: 'Best lunch this week?'})).toBeTruthy();
    expect(screen.queryByText('Add at least one column to start')).toBeNull();
    expect(screen.queryByTestId('cursors')).toBeNull();
    expect(screen.getByRole('button', {name: 'Move on to Brainstorm'})).toBeTruthy();
  });

  it('keeps the columns out of the way even when the board has some', async () => {
    renderPage(icebreakerBoard([{cards: [], id: 'c1', order: 0, title: 'Start'}] as unknown as Board['columns']));

    expect(await screen.findByRole('heading', {name: 'Best lunch this week?'})).toBeTruthy();
    expect(screen.queryByText('Start', {selector: 'h3, h2, p, span'})).toBeNull();
    expect(screen.queryByTestId('cursors')).toBeNull();
  });
});

describe('RetroPage after the icebreaker', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps the question one click away', async () => {
    renderPage({
      ...board(true),
      icebreaker: {
        answeredCount: 1,
        answers: [{author: {id: 'f', name: 'Fay'}, mine: true, text: 'Pasta'}],
        answersRevealed: true,
        question: {source: 'CUSTOM', text: 'Best lunch this week?'},
        state: 'ASKED',
      },
      phase: 'BRAINSTORM',
    } as unknown as Board);

    fireEvent.click(await screen.findByRole('button', {name: 'Icebreaker: Best lunch this week?'}));

    expect(await screen.findByText('Pasta')).toBeTruthy();
  });

  it('says so when the answers were never revealed', async () => {
    renderPage({
      ...board(true),
      icebreaker: {
        answeredCount: 1,
        answers: [{author: {id: 'f', name: 'Fay'}, mine: true, text: 'Pasta'}],
        answersRevealed: false,
        question: {source: 'CUSTOM', text: 'Best lunch this week?'},
        state: 'ASKED',
      },
      phase: 'BRAINSTORM',
    } as unknown as Board);

    fireEvent.click(await screen.findByRole('button', {name: 'Icebreaker: Best lunch this week?'}));

    expect(await screen.findByText('The answers were not revealed.')).toBeTruthy();
    expect(screen.queryByText('Pasta')).toBeNull();
  });
});

describe('RetroPage icebreaker preview in the waiting room', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the facilitator the preview, and a participant nothing', async () => {
    const withQuestion = (isFacilitator: boolean) =>
      ({
        ...board(isFacilitator),
        icebreaker: {
          answeredCount: 0,
          answers: [],
          answersRevealed: false,
          question: isFacilitator ? {source: 'CUSTOM', text: 'Best lunch this week?'} : null,
          state: 'WAITING',
        },
      }) as unknown as Board;

    renderPage(withQuestion(true));
    expect(await screen.findByText('Best lunch this week?')).toBeTruthy();
    expect(screen.getAllByRole('button', {hidden: true, name: 'Start with the icebreaker'})).toHaveLength(2);

    cleanup();
    renderPage(withQuestion(false));
    await screen.findByText('Welcome to the pit stop');
    expect(screen.queryByText('Only you can see this')).toBeNull();
  });
});
