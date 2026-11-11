// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ApiError} from '@/api/client';
import {fetchTeams} from '@/api/teams';
import {fetchTeamTemplates, saveRetroAsTemplate} from '@/api/templates';
import type {Board, Team, Template} from '@/api/types';
import {BoardToolbar} from '@/components/BoardToolbar';
import {ToastProvider} from '@/contexts/ToastContext';

vi.mock('@/api/teams', () => ({fetchTeams: vi.fn()}));
vi.mock('@/api/templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/templates')>()),
  fetchTeamTemplates: vi.fn(),
  saveRetroAsTemplate: vi.fn(),
}));

const board = {
  actions: [],
  columns: [],
  icebreaker: null,
  id: 'r1',
  isFacilitator: false,
  maxVotes: 3,
  myNotesRevealed: false,
  myVotesLeft: 3,
  phase: 'VOTE',
  teamId: 't1',
  template: {id: 'tpl', name: 'Sprint review'},
  timer: {state: 'IDLE'},
  title: 'Sprint 12',
} as unknown as Board;

const team = (isAdmin: boolean, isMember: boolean): Team => ({
  createdBy: 'someone',
  id: 't1',
  isAdmin,
  isMember,
  memberCount: 1,
  name: 'Core',
});

const renderToolbar = (
  teams: Team[],
  teamTemplateNames: string[] = [],
  overrides: Partial<Board> = {},
  dice?: React.ReactNode,
) => {
  vi.mocked(fetchTeams).mockResolvedValue(teams);
  vi.mocked(fetchTeamTemplates).mockResolvedValue({
    builtin: [],
    defaultTemplateId: 'builtin:start-stop-continue',
    team: teamTemplateNames.map((name) => ({name}) as Template),
  });

  render(
    <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
      <ToastProvider>
        <MemoryRouter>
          <BoardToolbar
            authorFilter={[]}
            board={{...board, ...overrides}}
            dice={dice}
            isAddingColumn={false}
            isBusy={false}
            isTimerBusy={false}
            onAddColumn={vi.fn()}
            onAddingColumnChange={vi.fn()}
            onAuthorFilterChange={vi.fn()}
            onHide={vi.fn()}
            onMaxVotesChange={vi.fn()}
            onOpenActions={vi.fn()}
            onPhaseChange={vi.fn()}
            onReveal={vi.fn()}
            onTakeFacilitation={vi.fn()}
            onTimer={vi.fn()}
            openActionCount={0}
            receivedAt={Date.now()}
          />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

describe('BoardToolbar save as template', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('is offered to an admin who is a member of the team', async () => {
    renderToolbar([team(true, true)], [], {phase: 'DISCUSS'});
    expect(await screen.findByRole('button', {name: 'Save as template'})).toBeTruthy();
  });

  it.each(['LOBBY', 'BRAINSTORM', 'SHARE', 'VOTE', 'ARCHIVED'] as const)('is hidden in the %s phase', async (phase) => {
    renderToolbar([team(true, true)], [], {phase});
    await waitFor(() => expect(fetchTeams).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('button', {name: 'Save as template'})).toBeNull();
  });

  it('is hidden from a member who is not an admin', async () => {
    renderToolbar([team(false, true)], [], {phase: 'DISCUSS'});
    await waitFor(() => expect(fetchTeams).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('button', {name: 'Save as template'})).toBeNull();
  });

  it('is hidden from an organisation admin who is not a member', async () => {
    renderToolbar([team(true, false)], [], {phase: 'DISCUSS'});
    await waitFor(() => expect(fetchTeams).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('button', {name: 'Save as template'})).toBeNull();
  });

  it('prefills the name with the template the retro came from and saves it', async () => {
    vi.mocked(saveRetroAsTemplate).mockResolvedValue({} as Awaited<ReturnType<typeof saveRetroAsTemplate>>);
    renderToolbar([team(true, true)], [], {phase: 'DISCUSS'});

    fireEvent.click(await screen.findByRole('button', {name: 'Save as template'}));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Sprint review');
    fireEvent.change(screen.getByLabelText('Description'), {target: {value: 'Our way'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));

    await waitFor(() =>
      expect(saveRetroAsTemplate).toHaveBeenCalledWith('r1', {
        description: 'Our way',
        name: 'Sprint review',
      }),
    );
    expect(await screen.findByText('Template saved')).toBeTruthy();
    expect(screen.getByRole('button', {name: 'View templates'})).toBeTruthy();
  });

  it('suffixes the prefilled name when the team already has a template with it', async () => {
    renderToolbar([team(true, true)], ['Sprint review', 'sprint review (copy)'], {phase: 'DISCUSS'});

    fireEvent.click(await screen.findByRole('button', {name: 'Save as template'}));

    await waitFor(() =>
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
        'Sprint review (copy 2)',
      ),
    );
  });

  it('shows a conflict inside the dialog and keeps it open', async () => {
    vi.mocked(saveRetroAsTemplate).mockRejectedValue(
      new ApiError(409, 'A template with this name already exists'),
    );
    renderToolbar([team(true, true)], [], {phase: 'DISCUSS'});

    fireEvent.click(await screen.findByRole('button', {name: 'Save as template'}));
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('A template with this name already exists');
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.queryByText('Template saved')).toBeNull();
  });
});

describe('BoardToolbar dice', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('puts the die right after the Discuss step', () => {
    renderToolbar([], [], {phase: 'DISCUSS'}, <button type="button">Roll your die</button>);

    const discuss = screen.getByText('Discuss');
    const die = screen.getByRole('button', {name: 'Roll your die'});

    expect(discuss.compareDocumentPosition(die) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      die.compareDocumentPosition(screen.getByRole('button', {name: 'Actions · 0'})) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
