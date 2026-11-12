// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ApiError} from '@/api/client';
import {fetchTeams} from '@/api/teams';
import {createTemplate, deleteTemplate, fetchTeamTemplates, updateTemplate} from '@/api/templates';
import type {Team, Template, TeamTemplates} from '@/api/types';
import {ToastProvider} from '@/contexts/ToastContext';
import {TeamTemplatesPage} from '@/pages/TeamTemplatesPage';

vi.mock('@/api/teams', () => ({fetchTeams: vi.fn()}));
vi.mock('@/api/templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/templates')>()),
  createTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  duplicateTemplate: vi.fn(),
  fetchTeamTemplates: vi.fn(),
  setDefaultTemplate: vi.fn(),
  updateTemplate: vi.fn(),
}));

const classic: Template = {
  actionReview: null,
  columns: [{prompt: null, title: 'Start'}],
  description: 'The classic.',
  icebreaker: null,
  id: 'builtin:start-stop-continue',
  maxVotes: null,
  name: 'Start / Stop / Continue',
  scope: 'BUILTIN',
  timerSeconds: null,
};

const mine: Template = {
  actionReview: false,
  columns: [
    {prompt: 'Good things', title: 'Glad'},
    {prompt: null, title: 'Sad'},
  ],
  description: null,
  icebreaker: true,
  id: 'u1',
  maxVotes: 4,
  name: 'Our format',
  scope: 'TEAM',
  timerSeconds: 300,
  updatedAt: '2026-03-04T10:00:00.000Z',
  updatedBy: {id: 'p1', name: 'Alice'},
};

const catalogue = (team: Template[] = [mine]): TeamTemplates => ({
  builtin: [classic],
  defaultTemplateId: classic.id,
  team,
});

const team = (isAdmin: boolean, isMember = true): Team => ({
  createdBy: 'x',
  id: 't1',
  isAdmin,
  isMember,
  memberCount: 2,
  name: 'Core',
});

const renderPage = (me: Team, data: TeamTemplates | Error = catalogue()) => {
  vi.mocked(fetchTeams).mockResolvedValue([me]);

  if (data instanceof Error) {
    vi.mocked(fetchTeamTemplates).mockRejectedValue(data);
  } else {
    vi.mocked(fetchTeamTemplates).mockResolvedValue(data);
  }

  render(
    <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/teams/t1/templates']}>
          <Routes>
            <Route element={<TeamTemplatesPage />} path="/teams/:teamId/templates" />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
};

const titles = () =>
  screen.getAllByLabelText(/^Title of column/).map((input) => (input as HTMLInputElement).value);

describe('TeamTemplatesPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows no write action to a plain member, but the last editor', async () => {
    renderPage(team(false));

    await screen.findByText('Our format');

    expect(screen.getByText('Last edited by Alice, 04/03/2026')).toBeTruthy();
    expect(screen.getByText('Default')).toBeTruthy();
    for (const label of ['Edit', 'Duplicate', 'Duplicate to team', 'Delete', 'New template']) {
      expect(screen.queryByRole('button', {name: label})).toBeNull();
    }
  });

  it('gives an admin the actions of each kind of template', async () => {
    renderPage(team(true));

    await screen.findByText('Our format');

    expect(screen.getByRole('button', {name: 'Edit'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Duplicate'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Delete'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Duplicate to team'})).toBeTruthy();
    expect(screen.getAllByRole('button', {name: 'Set as default'})).toHaveLength(1);
  });

  it('explains the empty team section', async () => {
    renderPage(team(true), catalogue([]));

    expect(
      await screen.findByText('No team template yet. Duplicate a classic or create your own.'),
    ).toBeTruthy();
    expect(screen.getAllByRole('button', {name: 'New template'})).toHaveLength(2);
  });

  it('disables New template at the 50 template cap', async () => {
    const full = Array.from({length: 50}, (_, index) => ({
      ...mine,
      id: `u${index}`,
      name: `T${index}`,
    }));
    renderPage(team(true), catalogue(full));

    const button = await screen.findByRole('button', {name: 'New template'});

    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/at most 50 templates/)).toBeTruthy();
  });

  it('says so when the caller is not in the team', async () => {
    renderPage(team(true, false), new ApiError(403, 'You are not a member of this team'));

    expect(await screen.findByText('You are not in this team')).toBeTruthy();
  });

  it('caps the columns at 8 and reorders them', async () => {
    renderPage(team(true));

    fireEvent.click(await screen.findByRole('button', {name: 'Edit'}));
    await screen.findByText('Edit template');
    expect(titles()).toEqual(['Glad', 'Sad']);

    fireEvent.click(screen.getByRole('button', {name: 'Move column 1 down'}));
    expect(titles()).toEqual(['Sad', 'Glad']);

    fireEvent.click(screen.getByRole('button', {name: 'Move column 2 up'}));
    expect(titles()).toEqual(['Glad', 'Sad']);

    const add = screen.getByRole('button', {
      name: 'Add column',
    }) as HTMLButtonElement;
    for (let index = 0; index < 6; index += 1) fireEvent.click(add);

    expect(add.disabled).toBe(true);
    expect(screen.getByText(/at most 8 columns/)).toBeTruthy();
  });

  it('saves the edited template and shows a server conflict in the editor', async () => {
    vi.mocked(updateTemplate).mockRejectedValueOnce(
      new ApiError(409, 'A template with this name already exists'),
    );
    renderPage(team(true));

    fireEvent.click(await screen.findByRole('button', {name: 'Edit'}));
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: {value: 'Renamed'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));

    expect(await screen.findByText('A template with this name already exists')).toBeTruthy();
    expect(updateTemplate).toHaveBeenCalledWith('t1', 'u1', {
      actionReview: false,
      columns: [
        {prompt: 'Good things', title: 'Glad'},
        {prompt: null, title: 'Sad'},
      ],
      description: null,
      icebreaker: true,
      maxVotes: 4,
      name: 'Renamed',
      timerSeconds: 300,
    });
  });

  it('shows the opening steps of the template and sends a changed one as null', async () => {
    vi.mocked(updateTemplate).mockResolvedValue(mine);
    renderPage(team(true));

    fireEvent.click(await screen.findByRole('button', {name: 'Edit'}));

    const pressed = (group: string, label: string) =>
      within(screen.getByRole('group', {name: group}))
        .getByRole('button', {name: label})
        .getAttribute('aria-pressed');

    expect(pressed('Icebreaker', 'On')).toBe('true');
    expect(pressed('Action review', 'Off')).toBe('true');

    fireEvent.click(
      within(screen.getByRole('group', {name: 'Icebreaker'})).getByRole('button', {
        name: 'Not set',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', {name: 'Action review'})).getByRole('button', {name: 'On'}),
    );
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));

    await waitFor(() =>
      expect(updateTemplate).toHaveBeenCalledWith(
        't1',
        'u1',
        expect.objectContaining({actionReview: true, icebreaker: null}),
      ),
    );
  });

  it('starts a new template with both opening steps not set', async () => {
    vi.mocked(createTemplate).mockResolvedValue(mine);
    renderPage(team(true), catalogue([]));

    fireEvent.click((await screen.findAllByRole('button', {name: 'New template'}))[0]);
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: {value: 'Fresh'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Add column'}));
    fireEvent.change(screen.getByLabelText(/^Title of column/), {
      target: {value: 'Glad'},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));

    await waitFor(() =>
      expect(createTemplate).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({actionReview: null, icebreaker: null}),
      ),
    );
  });

  it('deletes only after the confirmation', async () => {
    vi.mocked(deleteTemplate).mockResolvedValue(undefined);
    renderPage(team(true));

    fireEvent.click(await screen.findByRole('button', {name: 'Delete'}));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        'Delete "Our format"? Retros already created with it are not affected. This cannot be undone.',
      ),
    ).toBeTruthy();
    expect(deleteTemplate).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', {name: 'Delete'}));

    await waitFor(() => expect(deleteTemplate).toHaveBeenCalledWith('t1', 'u1'));
  });
});
