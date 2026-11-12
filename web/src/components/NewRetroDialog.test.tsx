// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ApiError} from '@/api/client';
import {createRetro} from '@/api/retros';
import {fetchTeams} from '@/api/teams';
import {fetchTeamTemplates} from '@/api/templates';
import type {Template, TeamTemplates} from '@/api/types';
import {NewRetroDialog} from '@/components/NewRetroDialog';
import {ToastProvider} from '@/contexts/ToastContext';

vi.mock('@/api/teams', () => ({fetchTeams: vi.fn()}));
vi.mock('@/api/templates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/templates')>()),
  fetchTeamTemplates: vi.fn(),
}));
vi.mock('@/api/retros', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/retros')>()),
  createRetro: vi.fn(),
}));

const template = (id: string, name: string, extra: Partial<Template> = {}): Template => ({
  actionReview: null,
  columns: [{prompt: 'What should we begin?', title: 'Start'}],
  description: `About ${name}`,
  icebreaker: null,
  id,
  maxVotes: null,
  name,
  scope: 'BUILTIN',
  timerSeconds: null,
  ...extra,
});

const ssc = template('builtin:start-stop-continue', 'Start / Stop / Continue');
const blank = template('builtin:blank', 'Blank', {
  columns: [],
  description: null,
});
const retroNight = template('u1', 'Retro night', {
  maxVotes: 7,
  scope: 'TEAM',
});

const catalogue = (overrides: Partial<TeamTemplates> = {}): TeamTemplates => ({
  builtin: [ssc, blank],
  defaultTemplateId: ssc.id,
  team: [retroNight],
  ...overrides,
});

const renderDialog = (teamIds = ['t1']) =>
  render(
    <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
      <ToastProvider>
        <MemoryRouter>
          <NewRetroDialog onClose={vi.fn()} teamIds={teamIds} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

const start = async (title = 'Sprint 12') => {
  fireEvent.change(screen.getByLabelText('Title'), {
    target: {value: title},
  });
  fireEvent.click(screen.getByRole('button', {name: 'Start'}));
};

const templateInput = async () =>
  (await screen.findByRole('combobox', {
    name: 'Template',
  })) as HTMLInputElement;

const choose = async (name: string) => {
  const input = await templateInput();

  fireEvent.focus(input);
  fireEvent.change(input, {target: {value: name}});
  fireEvent.click(await screen.findByRole('option', {name: new RegExp(name)}));
};

describe('NewRetroDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('preselects the default template and flags it', async () => {
    vi.mocked(fetchTeamTemplates).mockResolvedValue(catalogue());
    renderDialog();

    const input = await templateInput();

    expect(input.value).toBe('Start / Stop / Continue');

    fireEvent.mouseDown(input);
    const option = await screen.findByRole('option', {
      name: /Start \/ Stop \/ Continue/,
    });

    expect(within(option).getByText('Default')).toBeTruthy();
    expect(screen.getAllByText('Default')).toHaveLength(1);
  });

  it('groups the team templates before the classics', async () => {
    vi.mocked(fetchTeamTemplates).mockResolvedValue(catalogue());
    renderDialog();

    fireEvent.mouseDown(await templateInput());

    const groups = (await screen.findAllByRole('listbox')).flatMap((box) =>
      Array.from(box.querySelectorAll('.MuiAutocomplete-groupLabel')).map(
        (node) => node.textContent,
      ),
    );

    expect(groups).toEqual(['Your team', 'Classics']);
  });

  it('filters the options by template name or column name', async () => {
    vi.mocked(fetchTeamTemplates).mockResolvedValue(
      catalogue({
        team: [
          template('u1', 'Retro night', {
            columns: [{prompt: null, title: 'Wins'}],
            scope: 'TEAM',
          }),
        ],
      }),
    );
    renderDialog();

    fireEvent.focus(await templateInput());
    fireEvent.change(await templateInput(), {target: {value: 'blan'}});
    expect(await screen.findByRole('option', {name: 'Blank'})).toBeTruthy();
    expect(screen.queryByRole('option', {name: /Retro night/})).toBeNull();

    fireEvent.change(await templateInput(), {target: {value: 'wins'}});
    expect(await screen.findByRole('option', {name: /Retro night/})).toBeTruthy();
    expect(screen.queryByRole('option', {name: 'Blank'})).toBeNull();

    fireEvent.change(await templateInput(), {target: {value: 'zzz'}});
    expect(await screen.findByText('No template matches')).toBeTruthy();
  });

  it('hides the team group when the team has no template', async () => {
    vi.mocked(fetchTeamTemplates).mockResolvedValue(catalogue({team: []}));
    renderDialog();

    fireEvent.mouseDown(await templateInput());

    await screen.findByText('Classics');

    expect(screen.queryByText('Your team')).toBeNull();
  });

  it('previews the description and the column prompts, or the blank board', async () => {
    vi.mocked(fetchTeamTemplates).mockResolvedValue(catalogue());
    renderDialog();

    await screen.findByText('About Start / Stop / Continue');
    expect(screen.getByText('Start: What should we begin?')).toBeTruthy();

    await choose('Blank');

    expect(
      screen.getByText('No column yet: you add them on the board before people write.'),
    ).toBeTruthy();
  });

  it('prefills the votes from the template and sends the template without columns', async () => {
    vi.mocked(fetchTeamTemplates).mockResolvedValue(catalogue());
    vi.mocked(createRetro).mockResolvedValue({id: 'b1'} as Awaited<ReturnType<typeof createRetro>>);
    renderDialog();

    await choose('Retro night');
    expect(screen.getByLabelText('Votes per person').textContent).toBe('7 votes');

    await choose('Blank');
    expect(screen.getByLabelText('Votes per person').textContent).toBe('3 votes');

    await choose('Retro night');
    await start();

    await waitFor(() =>
      expect(createRetro).toHaveBeenCalledWith('t1', 'Sprint 12', {
        actionReview: true,
        icebreaker: true,
        maxVotes: 7,
        templateId: 'u1',
      }),
    );
  });

  it('starts with an icebreaker by default and lets the team skip it', async () => {
    vi.mocked(fetchTeamTemplates).mockResolvedValue(catalogue());
    vi.mocked(createRetro).mockResolvedValue({id: 'b1'} as Awaited<ReturnType<typeof createRetro>>);
    renderDialog();

    await templateInput();
    const checkbox = screen.getByRole('checkbox', {
      name: 'Start with an icebreaker',
    }) as HTMLInputElement;

    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    await start();

    await waitFor(() =>
      expect(createRetro).toHaveBeenCalledWith('t1', 'Sprint 12', {
        actionReview: true,
        icebreaker: false,
        maxVotes: 3,
        templateId: 'builtin:start-stop-continue',
      }),
    );
  });

  it('prefills both opening steps from the template and resets them when switching', async () => {
    const quiet = template('u2', 'Quiet', {
      actionReview: false,
      icebreaker: false,
      scope: 'TEAM',
    });
    vi.mocked(fetchTeamTemplates).mockResolvedValue(catalogue({team: [quiet, retroNight]}));
    vi.mocked(createRetro).mockResolvedValue({id: 'b1'} as Awaited<ReturnType<typeof createRetro>>);
    renderDialog();

    const isChecked = (name: string) =>
      (screen.getByRole('checkbox', {name}) as HTMLInputElement).checked;

    await templateInput();
    expect(isChecked('Start with an icebreaker')).toBe(true);
    expect(isChecked('Review open actions')).toBe(true);

    await choose('Quiet');
    expect(isChecked('Start with an icebreaker')).toBe(false);
    expect(isChecked('Review open actions')).toBe(false);

    fireEvent.click(screen.getByRole('checkbox', {name: 'Review open actions'}));
    expect(isChecked('Review open actions')).toBe(true);

    await choose('Retro night');
    expect(isChecked('Start with an icebreaker')).toBe(true);
    expect(isChecked('Review open actions')).toBe(true);

    await choose('Quiet');
    expect(isChecked('Review open actions')).toBe(false);

    await start();

    await waitFor(() =>
      expect(createRetro).toHaveBeenCalledWith('t1', 'Sprint 12', {
        actionReview: false,
        icebreaker: false,
        maxVotes: 3,
        templateId: 'u2',
      }),
    );
  });

  it('lists the steps that are on in the preview', async () => {
    vi.mocked(fetchTeamTemplates).mockResolvedValue(catalogue());
    renderDialog();

    await screen.findByText('Icebreaker · Action review');

    fireEvent.click(screen.getByRole('checkbox', {name: 'Start with an icebreaker'}));
    expect(screen.getByText('Action review')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', {name: 'Review open actions'}));
    expect(screen.queryByText('Action review')).toBeNull();
  });

  it('reloads and falls back to the default when the template vanished', async () => {
    vi.mocked(fetchTeamTemplates)
      .mockResolvedValueOnce(catalogue())
      .mockResolvedValue(catalogue({team: []}));
    vi.mocked(createRetro).mockRejectedValue(new ApiError(404, 'Template not found'));
    renderDialog();

    await choose('Retro night');
    await start();

    expect(await screen.findByText('Template not found')).toBeTruthy();
    await waitFor(() => expect(fetchTeamTemplates).toHaveBeenCalledTimes(2));
    await waitFor(async () =>
      expect((await templateInput()).value).toBe('Start / Stop / Continue'),
    );
  });

  it('shows the team select from two teams on, and reloads the templates on change', async () => {
    vi.mocked(fetchTeams).mockResolvedValue([
      {
        createdBy: 'x',
        id: 't1',
        isAdmin: true,
        isMember: true,
        memberCount: 1,
        name: 'Core',
      },
      {
        createdBy: 'x',
        id: 't2',
        isAdmin: true,
        isMember: true,
        memberCount: 1,
        name: 'Ops',
      },
    ]);
    vi.mocked(fetchTeamTemplates).mockResolvedValue(catalogue());
    renderDialog(['t1', 't2']);

    await templateInput();
    expect(fetchTeamTemplates).toHaveBeenCalledWith('t1');

    fireEvent.mouseDown(screen.getByLabelText('Team'));
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('Ops'));

    await waitFor(() => expect(fetchTeamTemplates).toHaveBeenCalledWith('t2'));
  });

  it('has no team select for a single team', async () => {
    vi.mocked(fetchTeamTemplates).mockResolvedValue(catalogue());
    renderDialog();

    await templateInput();

    expect(screen.queryByLabelText('Team')).toBeNull();
  });

  it('offers a retry when the templates fail to load', async () => {
    vi.mocked(fetchTeamTemplates).mockRejectedValueOnce(new Error('down'));
    vi.mocked(fetchTeamTemplates).mockResolvedValue(catalogue());
    renderDialog();

    fireEvent.click(await screen.findByRole('button', {name: 'Retry'}));

    expect(await templateInput()).toBeTruthy();
  });
});
