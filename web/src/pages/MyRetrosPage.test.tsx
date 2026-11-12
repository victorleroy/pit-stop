// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createRetro, fetchMyRetros} from '@/api/retros';
import {fetchTeams} from '@/api/teams';
import {fetchTeamTemplates} from '@/api/templates';
import type {Team, TeamTemplates} from '@/api/types';
import {ToastProvider} from '@/contexts/ToastContext';
import {MyRetrosPage} from '@/pages/MyRetrosPage';

vi.mock('@/api/teams', () => ({fetchTeams: vi.fn()}));
vi.mock('@/api/templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/templates')>()),
  fetchTeamTemplates: vi.fn(),
}));
vi.mock('@/api/retros', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/retros')>()),
  createRetro: vi.fn(),
  fetchMyRetros: vi.fn(),
}));

const startStopContinue = {
  actionReview: null,
  columns: [
    {prompt: null, title: 'Start'},
    {prompt: null, title: 'Stop'},
    {prompt: null, title: 'Continue'},
  ],
  description: null,
  icebreaker: null,
  id: 'builtin:start-stop-continue',
  maxVotes: null,
  name: 'Start / Stop / Continue',
  scope: 'BUILTIN' as const,
  timerSeconds: null,
};

const templates: TeamTemplates = {
  builtin: [startStopContinue],
  defaultTemplateId: startStopContinue.id,
  team: [],
};

const team = (id: string, name: string, isAdmin: boolean, isMember = true): Team => ({
  createdBy: 'someone',
  id,
  isAdmin,
  isMember,
  memberCount: 1,
  name,
});

const renderPage = (teams: Team[]) => {
  vi.mocked(fetchTeams).mockResolvedValue(teams);
  vi.mocked(fetchMyRetros).mockResolvedValue([]);
  vi.mocked(fetchTeamTemplates).mockResolvedValue(templates);

  render(
    <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
      <ToastProvider>
        <MemoryRouter>
          <MyRetrosPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

describe('MyRetrosPage new retro', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens the form straight away when the user administers one team', async () => {
    renderPage([team('t1', 'Core', true), team('t2', 'Ops', false)]);

    fireEvent.click(await screen.findByRole('button', {name: 'New retro'}));

    expect(await screen.findByText('New retrospective')).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lets the user pick the team inside the form, among the teams they administer and joined', async () => {
    vi.mocked(createRetro).mockResolvedValue({id: 'b1'} as Awaited<ReturnType<typeof createRetro>>);
    renderPage([
      team('t1', 'Core', true),
      team('t2', 'Ops', true),
      team('t3', 'Other', false),
      team('t4', 'Org only', true, false),
    ]);

    fireEvent.click(await screen.findByRole('button', {name: 'New retro'}));

    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.mouseDown(await screen.findByLabelText('Team'));
    expect(screen.queryByRole('option', {name: 'Other'})).toBeNull();
    expect(screen.queryByRole('option', {name: 'Org only'})).toBeNull();
    fireEvent.click(await screen.findByRole('option', {name: 'Ops'}));
    fireEvent.change(await screen.findByLabelText('Title'), {target: {value: 'Sprint 12'}});
    await screen.findByRole('radio', {name: /Start \/ Stop \/ Continue/});
    fireEvent.click(screen.getByRole('button', {name: 'Start'}));

    await waitFor(() =>
      expect(createRetro).toHaveBeenCalledWith('t2', 'Sprint 12', {
        actionReview: true,
        icebreaker: true,
        maxVotes: 3,
        templateId: 'builtin:start-stop-continue',
      }),
    );
  });

  it('offers no new retro to an org admin who is not in any team they administer', async () => {
    renderPage([team('t4', 'Org only', true, false)]);

    await screen.findByText('No retro yet');

    expect(screen.queryByRole('button', {name: 'New retro'})).toBeNull();
  });

  it('offers no new retro to a user who administers no team', async () => {
    renderPage([team('t2', 'Ops', false)]);

    await screen.findByText('No retro yet');

    expect(screen.queryByRole('button', {name: 'New retro'})).toBeNull();
  });

  it('labels a retro that has not started as the waiting room, among those in progress', async () => {
    vi.mocked(fetchTeams).mockResolvedValue([]);
    vi.mocked(fetchMyRetros).mockResolvedValue([
      {id: 'r1', isFacilitator: true, phase: 'LOBBY', teamId: 't1', teamName: 'Core', title: 'Sprint 13'},
    ] as Awaited<ReturnType<typeof fetchMyRetros>>);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <ToastProvider>
          <MemoryRouter>
            <MyRetrosPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Waiting room')).toBeTruthy();
    expect(screen.queryByText('Archived')).toBeNull();
  });

  it('labels a retro in the icebreaker', async () => {
    vi.mocked(fetchTeams).mockResolvedValue([]);
    vi.mocked(fetchMyRetros).mockResolvedValue([
      {id: 'r2', isFacilitator: false, phase: 'ICEBREAKER', teamId: 't1', teamName: 'Core', title: 'Sprint 14'},
    ] as Awaited<ReturnType<typeof fetchMyRetros>>);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <ToastProvider>
          <MemoryRouter>
            <MyRetrosPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Icebreaker')).toBeTruthy();
  });
});
