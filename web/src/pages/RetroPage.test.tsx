// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {answerIcebreaker, fetchBoard, hideIcebreakerAnswer, revealIcebreakerAnswer, updateRetro} from '@/api/retros';
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
  answerIcebreaker: vi.fn(),
  fetchBoard: vi.fn(),
  hideIcebreakerAnswer: vi.fn(),
  revealIcebreakerAnswer: vi.fn(),
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
    expect(screen.queryByRole('button', {name: /Start|Close/})).toBeNull();
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

    fireEvent.click(await screen.findByRole('button', {name: 'Start'}));

    await waitFor(() => expect(updateRetro).toHaveBeenCalledWith('r1', {phase: 'BRAINSTORM'}));
  });

  it('lets the facilitator close the waiting room, and reopen it from the toolbar', async () => {
    renderPage(board(true));

    fireEvent.click(await screen.findByRole('button', {name: 'Close'}));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', {name: /rename/i})).toBeTruthy();
    expect(screen.queryByTestId('cursors')).toBeNull();
    expect(sendCursor).not.toHaveBeenCalled();

    expect(screen.queryByText('Back to the waiting room')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Waiting room'}));

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

    fireEvent.click(screen.getByRole('button', {name: 'Close'}));

    expect(gameActions()).toEqual(['game.join', 'game.leave']);
  });
});

describe('RetroPage with an icebreaker', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const columns = [{cards: [], id: 'c1', order: 0, title: 'Start'}] as unknown as Board['columns'];
  const icebreakerBoard = (overrides: Partial<Board> = {}, isFacilitator = true) =>
    ({
      ...board(isFacilitator),
      icebreaker: {
        answeredCount: 0,
        answers: [],
        question: {id: 'q1', text: 'Best lunch this week?'},
        state: 'ASKED',
      },
      phase: 'ICEBREAKER',
      ...overrides,
    }) as unknown as Board;

  it('starts on the icebreaker from the single Start when the retro has one', async () => {
    vi.mocked(updateRetro).mockResolvedValue(icebreakerBoard());
    const lobby = {...board(true), icebreaker: {answeredCount: 0, answers: [], question: null, state: 'WAITING'}} as unknown as Board;
    renderPage(lobby);

    fireEvent.click(await screen.findByRole('button', {name: 'Start'}));
    await waitFor(() => expect(updateRetro).toHaveBeenCalledWith('r1', {phase: 'ICEBREAKER'}));
    expect(screen.queryByRole('button', {name: /without icebreaker|with the icebreaker/})).toBeNull();
  });

  it('chains into the review when it is on: started without an icebreaker, or moving on from it', async () => {
    const review = {
      enabled: true,
      focusActionId: null,
      items: [{action: {closedAt: null, id: 'a1', status: 'OPEN', text: 'Fix the CI'}, outcome: null}],
    } as unknown as Board['review'];
    vi.mocked(updateRetro).mockResolvedValue({...icebreakerBoard({review}), phase: 'REVIEW'} as Board);
    const lobby = {...board(true), review} as unknown as Board;
    renderPage(lobby);

    expect(await screen.findByLabelText('Review 1 open action first')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Start'}));
    await waitFor(() => expect(updateRetro).toHaveBeenCalledWith('r1', {phase: 'REVIEW'}));

    cleanup();
    vi.mocked(updateRetro).mockClear();
    renderPage(icebreakerBoard({review}));

    fireEvent.click(await screen.findByRole('button', {name: 'Move on to Review'}));
    await waitFor(() => expect(updateRetro).toHaveBeenCalledWith('r1', {phase: 'REVIEW'}));
    expect(screen.queryByLabelText(/open action/)).toBeNull();
  });

  it('shows the question and the answers zone in the dialog, over the board', async () => {
    renderPage(icebreakerBoard({columns: []}));

    const dialog = await screen.findByRole('dialog', {name: 'Best lunch this week?'});

    expect(within(dialog).getByRole('group', {name: 'Answers'})).toBeTruthy();
    expect(within(dialog).queryByTestId('wheel-gun')).toBeNull();
    expect(screen.queryByTestId('cursors')).toBeNull();
  });

  it('lets the facilitator move on to brainstorm even with no column', async () => {
    vi.mocked(updateRetro).mockResolvedValue({...icebreakerBoard(), phase: 'BRAINSTORM'} as Board);
    renderPage(icebreakerBoard({columns: []}));

    const button = (await screen.findByRole('button', {name: 'Move on to Brainstorm'})) as HTMLButtonElement;

    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(updateRetro).toHaveBeenCalledWith('r1', {phase: 'BRAINSTORM'}));
  });

  it('makes a participant wait for the facilitator, who can be replaced when away', async () => {
    renderPage(icebreakerBoard({columns}, false));

    expect(await screen.findByText('Waiting for Fay to move on')).toBeTruthy();
    expect(screen.queryByRole('button', {name: /Move on/})).toBeNull();
  });

  it('writes my post-it with a PUT', async () => {
    vi.mocked(answerIcebreaker).mockResolvedValue(icebreakerBoard());
    renderPage(icebreakerBoard());

    fireEvent.click(await screen.findByRole('group', {name: 'Answers'}));
    const field = screen.getByRole('textbox', {name: 'Your answer'});
    fireEvent.change(field, {target: {value: ' Pasta '}});
    fireEvent.keyDown(field, {key: 'Enter'});

    await waitFor(() => expect(answerIcebreaker).toHaveBeenCalledWith('r1', 'Pasta'));
  });

  it('shows my post-it with a POST and hides it with a DELETE on the eye', async () => {
    const withMine = (revealed: boolean) =>
      icebreakerBoard({
        icebreaker: {
          answeredCount: 1,
          answers: [{author: {id: 'f', name: 'Fay'}, mine: true, revealed, text: 'Pasta'}],
          question: {id: 'q1', text: 'Best lunch this week?'},
          state: 'ASKED',
        },
      } as Partial<Board>);
    vi.mocked(revealIcebreakerAnswer).mockResolvedValue(withMine(true));
    vi.mocked(hideIcebreakerAnswer).mockResolvedValue(withMine(false));
    renderPage(withMine(false));

    fireEvent.click(await screen.findByRole('button', {name: 'Show my answer'}));
    await waitFor(() => expect(revealIcebreakerAnswer).toHaveBeenCalledWith('r1'));

    cleanup();
    renderPage(withMine(true));

    fireEvent.click(await screen.findByRole('button', {name: 'Hide my answer'}));
    await waitFor(() => expect(hideIcebreakerAnswer).toHaveBeenCalledWith('r1'));
  });

  it('closes the dialog for everybody once the phase is brainstorm', async () => {
    renderPage(icebreakerBoard({columns, phase: 'BRAINSTORM'}, false));

    expect(await screen.findByText('Start')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('RetroPage after the icebreaker', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const after = (answers: unknown[]) =>
    ({
      ...board(true),
      icebreaker: {
        answeredCount: answers.length,
        answers,
        question: {id: 'q1', text: 'Best lunch this week?'},
        state: 'ASKED',
      },
      phase: 'BRAINSTORM',
    }) as unknown as Board;

  it('lists only the revealed answers in the recap', async () => {
    renderPage(
      after([
        {author: {id: 'f', name: 'Fay'}, mine: true, revealed: true, text: 'Pasta'},
        {author: {id: 'b', name: 'Bea'}, mine: false, revealed: false, text: ''},
        {author: {id: 'z', name: 'Zed'}, mine: true, revealed: false, text: 'Secret'},
      ]),
    );

    fireEvent.click(await screen.findByRole('button', {name: 'Icebreaker: Best lunch this week?'}));

    expect(await screen.findByText('Pasta')).toBeTruthy();
    expect(screen.queryByText('Secret')).toBeNull();
    expect(screen.queryByText('Bea')).toBeNull();
  });

  it('says so when nothing was shared', async () => {
    renderPage(after([{author: {id: 'b', name: 'Bea'}, mine: false, revealed: false, text: ''}]));

    fireEvent.click(await screen.findByRole('button', {name: 'Icebreaker: Best lunch this week?'}));

    expect(await screen.findByText('No answer was shared.')).toBeTruthy();
  });
});
