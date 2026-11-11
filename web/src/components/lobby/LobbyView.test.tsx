// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import type {ComponentProps} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Participant, TeamMember} from '@/api/types';
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
    if (backdrop) fireEvent.click(backdrop);

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

  it('offers the start and the board setup to the facilitator only, whatever the presence', () => {
    const onStart = vi.fn();
    const onSetUpBoard = vi.fn();
    const {unmount} = renderLobby({isFacilitator: true, onSetUpBoard, onStart, participants: []});

    fireEvent.click(screen.getByRole('button', {name: 'Start the retro'}));
    fireEvent.click(screen.getByRole('button', {name: 'Set up the board'}));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onSetUpBoard).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Waiting for/)).toBeNull();

    unmount();
    renderLobby({onSetUpBoard});

    expect(screen.queryByRole('button', {name: /Start|Set up/})).toBeNull();
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

  it('mounts the game where it is given', () => {
    renderLobby({game: <p>the game</p>});

    expect(screen.getByText('the game')).toBeTruthy();
  });
});
