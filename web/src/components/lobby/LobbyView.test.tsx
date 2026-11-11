// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import type {ComponentProps} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Participant, TeamMember} from '@/api/types';
import {PRIME_DIRECTIVE} from '@/components/lobby/lobbyCopy';
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

  it('welcomes the team with the retro and team names', () => {
    renderLobby();

    expect(screen.getByRole('heading', {name: 'Welcome to the pit stop'})).toBeTruthy();
    expect(screen.getByText('Sprint 12 · Core')).toBeTruthy();
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

  it('offers the start to the facilitator only, whatever the presence', () => {
    const onStart = vi.fn();
    const {unmount} = renderLobby({isFacilitator: true, onStart, participants: []});

    fireEvent.click(screen.getByRole('button', {name: 'Start the retro'}));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', {name: 'Start the retro'}) as HTMLButtonElement).disabled).toBe(false);

    unmount();
    renderLobby();

    expect(screen.queryByRole('button', {name: /Start/})).toBeNull();
  });

  it('tells a participant to take over when the facilitator is away, without a second button', () => {
    renderLobby({participants: [present('b')]});

    expect(
      screen.getByText('Waiting for A to start. You can take over from the toolbar.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', {name: /take over|start/i})).toBeNull();
  });

  it('says nothing about the facilitator while they are here', () => {
    renderLobby();

    expect(screen.queryByText(/Waiting for/)).toBeNull();
  });

  it('only says reconnecting when the socket is down', () => {
    renderLobby({isConnected: false, participants: []});

    expect(screen.getByText('Reconnecting…')).toBeTruthy();
    expect(screen.queryByText(/joined/)).toBeNull();
    expect(screen.queryByText(/Waiting for/)).toBeNull();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('shows no count and no absent facilitator before the first presence arrives', () => {
    renderLobby({participants: []});

    expect(screen.queryByText(/joined/)).toBeNull();
    expect(screen.queryByText(/Waiting for/)).toBeNull();
  });

  it('shows the Prime Directive with its attribution', () => {
    renderLobby();

    expect(screen.getByText(PRIME_DIRECTIVE.text)).toBeTruthy();
    expect(screen.getByText(PRIME_DIRECTIVE.attribution as string)).toBeTruthy();
  });

  it('mounts the game where it is given', () => {
    renderLobby({game: <p>the game</p>});

    expect(screen.getByText('the game')).toBeTruthy();
  });
});
