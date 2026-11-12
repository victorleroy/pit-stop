// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import type {ComponentProps} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Participant, TeamMember} from '@/api/types';
import {LobbyPresence} from '@/components/lobby/LobbyPresence';
import {LobbyView} from '@/components/lobby/LobbyView';

const member = (userId: string): TeamMember => ({
  email: `${userId}@example.com`,
  isAdmin: false,
  name: userId.toUpperCase(),
  userId,
});

const present = (userId: string): Participant => ({name: userId.toUpperCase(), userId});

const members = ['a', 'b', 'c', 'd', 'e'].map(member);

const renderLobby = (props: Partial<ComponentProps<typeof LobbyView>> = {}) =>
  render(
    <LobbyView
      facilitatorId="a"
      isConnected
      isFacilitator={false}
      members={members}
      onStart={vi.fn()}
      participants={[present('a'), present('b'), present('c')]}
      retroTitle="Sprint 12"
      teamName="Core"
      {...props}
    />,
  );

describe('LobbyView', () => {
  afterEach(cleanup);

  it('welcomes the team in a dialog with the retro and team names', () => {
    renderLobby();

    expect(screen.getByRole('dialog', {name: 'Welcome to the pit stop'})).toBeTruthy();
    expect(screen.getByText('Sprint 12 · Core')).toBeTruthy();
  });

  it('cannot be dismissed with Escape or the backdrop', () => {
    renderLobby();
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, {key: 'Escape'});
    const backdrop = document.querySelector('.MuiBackdrop-root');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows nothing once closed', () => {
    renderLobby({open: false});

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('counts the present team members and ignores anybody else', () => {
    renderLobby({participants: [present('a'), present('b'), present('c'), present('stranger')]});

    expect(screen.getByText('3/5 joined')).toBeTruthy();
    expect(screen.queryByLabelText(/STRANGER/)).toBeNull();
  });

  it('lists who is here before who is not', () => {
    renderLobby();

    const names = screen.getAllByRole('img').map((node) => node.getAttribute('aria-label'));

    expect(names).toEqual([
      'A, here',
      'B, here',
      'C, here',
      'D, not here yet',
      'E, not here yet',
    ]);
    expect(screen.getByText('Not here yet')).toBeTruthy();
  });

  it('says so when everybody is here', () => {
    renderLobby({participants: members.map(({userId}) => present(userId))});

    expect(screen.getByText('5/5 joined')).toBeTruthy();
    expect(screen.getByText('Everyone is here')).toBeTruthy();
  });

  it('keeps the avatars to a couple of rows on a big team', () => {
    const many = Array.from({length: 30}, (_unused, index) => member(`u${index}`));

    renderLobby({members: many, participants: [present('u0')]});

    expect(screen.getAllByRole('img')).toHaveLength(16);
    expect(screen.getByText('+14')).toBeTruthy();
  });

  it('offers a single Start to the facilitator only, whatever the presence', () => {
    const onStart = vi.fn();
    const {unmount} = renderLobby({isFacilitator: true, onStart, participants: []});

    fireEvent.click(screen.getByRole('button', {name: 'Start'}));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', {name: /icebreaker|Set up/i})).toBeNull();
    expect(screen.queryByText(/Waiting for/)).toBeNull();

    unmount();
    renderLobby();

    expect(screen.queryByRole('button', {name: /Start/})).toBeNull();
  });

  it('lets the facilitator alone close the waiting room', () => {
    const onClose = vi.fn();
    const {unmount} = renderLobby({isFacilitator: true, onClose});

    fireEvent.click(within(screen.getByRole('dialog', {name: 'Welcome to the pit stop'})).getByRole('button', {name: 'Close'}));

    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    renderLobby({onClose});

    expect(screen.queryByRole('button', {name: 'Close'})).toBeNull();
  });

  it('tells a participant who will start the retro', () => {
    renderLobby({onTakeOver: vi.fn()});

    expect(screen.getByText('Waiting for A to start the retro')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lets a participant take over from the dialog when the facilitator is away', () => {
    const onTakeOver = vi.fn();
    renderLobby({onTakeOver, participants: [present('b')]});

    fireEvent.click(screen.getByRole('button', {name: 'Take over facilitation'}));

    expect(onTakeOver).toHaveBeenCalledTimes(1);
  });

  it('only says reconnecting when the socket is down', () => {
    renderLobby({isConnected: false, onTakeOver: vi.fn(), participants: []});

    expect(screen.getByText('Reconnecting…')).toBeTruthy();
    expect(screen.queryByText(/joined/)).toBeNull();
    expect(screen.queryByRole('button', {name: 'Take over facilitation'})).toBeNull();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('shows no count and no absent facilitator before the first presence arrives', () => {
    renderLobby({onTakeOver: vi.fn(), participants: []});

    expect(screen.queryByText(/joined/)).toBeNull();
    expect(screen.queryByRole('button', {name: 'Take over facilitation'})).toBeNull();
  });

  it('no longer carries the Prime Directive', () => {
    renderLobby();

    expect(screen.queryByText(/Prime Directive/)).toBeNull();
    expect(screen.queryByText(/everyone did the best job they could/)).toBeNull();
  });

  it('shows the icebreaker step in the same dialog, without the waiting room or the game', () => {
    const onStart = vi.fn();
    renderLobby({
      game: <p>the game</p>,
      icebreaker: <h2 id="icebreaker-title">Best lunch?</h2>,
      isFacilitator: true,
      onClose: vi.fn(),
      onStart,
      startLabel: 'Move on to Brainstorm',
    });

    expect(screen.getByRole('dialog', {name: 'Best lunch?'})).toBeTruthy();
    expect(screen.queryByText('the game')).toBeNull();
    expect(screen.queryByText('Welcome to the pit stop')).toBeNull();
        expect(screen.queryByRole('button', {name: 'Close'})).toBeNull();

    fireEvent.click(screen.getByRole('button', {name: 'Move on to Brainstorm'}));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('tells a participant who will move on from the icebreaker, with a takeover when away', () => {
    const onTakeOver = vi.fn();
    renderLobby({icebreaker: <h2 id="icebreaker-title">Best lunch?</h2>, onTakeOver, participants: [present('b')]});

    expect(screen.getByText('Waiting for A to move on')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Take over facilitation'}));

    expect(onTakeOver).toHaveBeenCalledTimes(1);
  });

  it('names at most twelve of the people past the avatars, then counts the rest', async () => {
    const crowd = Array.from({length: 40}, (_, index) => member(`m${index}`));
    render(<LobbyPresence isConnected members={crowd} participants={[]} />);

    fireEvent.mouseOver(screen.getByLabelText('24 more'));
    const tooltip = await screen.findByRole('tooltip');

    expect(tooltip.textContent).toContain('M27 · not here yet');
    expect(tooltip.textContent).not.toContain('M28');
    expect(tooltip.textContent).toContain('+12 more');
  });

  it('mounts the game where it is given', () => {
    renderLobby({game: <p>the game</p>});

    expect(screen.getByText('the game')).toBeTruthy();
  });
});
