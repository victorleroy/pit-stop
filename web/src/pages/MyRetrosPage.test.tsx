// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createRetro, fetchMyRetros} from '@/api/retros';
import {fetchTeams} from '@/api/teams';
import type {Team} from '@/api/types';
import {ToastProvider} from '@/contexts/ToastContext';
import {MyRetrosPage} from '@/pages/MyRetrosPage';

vi.mock('@/api/teams', () => ({fetchTeams: vi.fn()}));
vi.mock('@/api/retros', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/retros')>()),
  createRetro: vi.fn(),
  fetchMyRetros: vi.fn(),
}));

const team = (id: string, name: string, isAdmin: boolean): Team => ({
  createdBy: 'someone',
  id,
  isAdmin,
  isMember: true,
  memberCount: 1,
  name,
});

const renderPage = (teams: Team[]) => {
  vi.mocked(fetchTeams).mockResolvedValue(teams);
  vi.mocked(fetchMyRetros).mockResolvedValue([]);

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

  it('asks which team first when the user administers several', async () => {
    vi.mocked(createRetro).mockResolvedValue({id: 'b1'} as Awaited<ReturnType<typeof createRetro>>);
    renderPage([team('t1', 'Core', true), team('t2', 'Ops', true), team('t3', 'Other', false)]);

    fireEvent.click(await screen.findByRole('button', {name: 'New retro'}));

    expect(screen.queryByRole('menuitem', {name: 'Other'})).toBeNull();
    fireEvent.click(await screen.findByRole('menuitem', {name: 'Ops'}));
    fireEvent.change(await screen.findByLabelText('Title'), {target: {value: 'Sprint 12'}});
    fireEvent.click(screen.getByRole('button', {name: 'Start'}));

    await waitFor(() =>
      expect(createRetro).toHaveBeenCalledWith('t2', 'Sprint 12', ['Start', 'Stop', 'Continue'], 3),
    );
  });

  it('offers no new retro to a user who administers no team', async () => {
    renderPage([team('t2', 'Ops', false)]);

    await screen.findByText('No retro yet');

    expect(screen.queryByRole('button', {name: 'New retro'})).toBeNull();
  });
});
