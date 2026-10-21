import {Harness} from '../helpers/harness';
import type {AuthContext} from '~/Security/AuthContext';

/** Votes, clusters, actions and the timer: BEHAVIOUR.md section 6 and section 12. */
describe('board', () => {
  let harness: Harness;
  let owner: AuthContext;
  let member: AuthContext;
  let teamId: string;
  let retroId: string;
  let columnId: string;

  beforeEach(async () => {
    harness = Harness.create();

    const orgId = await harness.createOrg();
    owner = await harness.createUser(orgId, 'Victor', 'admin');
    member = await harness.createUser(orgId, 'Alice');

    teamId = await harness.createTeam(owner, [member]);

    const board = await harness.container.retroManager.create(owner, teamId, 'Sprint 42');

    retroId = board.id;
    columnId = board.columns[0]!.id;
  });

  afterEach(async () => harness.destroy());

  const setPhase = (phase: 'SHARE' | 'VOTE' | 'DISCUSS' | 'ARCHIVED') =>
    harness.container.retroManager.updateRetro(owner, retroId, {phase});

  const cardIds = async () => {
    const board = await harness.container.retroManager.getBoard(owner, retroId);

    return board.columns[0]!.cards.map((card) => card.id);
  };

  describe('clusters', () => {
    beforeEach(async () => {
      await harness.container.noteManager.create(owner, retroId, columnId, 'a');
      await harness.container.noteManager.create(owner, retroId, columnId, 'b');
      await setPhase('SHARE');
    });

    it('creates a cluster holding both notes when dropping one note on a free one', async () => {
      const [first, second] = await cardIds();
      const board = await harness.container.clusterManager.group(owner, retroId, first!, second!);

      expect(board.columns[0]!.cards).toHaveLength(1);
      expect(board.columns[0]!.cards[0]!.type).toBe('cluster');
      expect(board.columns[0]!.cards[0]!.notes).toHaveLength(2);
    });

    it('refuses to group a note with itself', async () => {
      const [first] = await cardIds();

      await expect(
        harness.container.clusterManager.group(owner, retroId, first!, first!),
      ).rejects.toThrow('cannot be grouped with itself');
    });

    it('refuses to group across two columns', async () => {
      const board = await harness.container.retroManager.getBoard(owner, retroId);
      const other = board.columns[1]!.id;

      await harness.container.retroManager.updateRetro(owner, retroId, {phase: 'BRAINSTORM'});
      await harness.container.noteManager.create(owner, retroId, other, 'elsewhere');
      await setPhase('SHARE');

      const refreshed = await harness.container.retroManager.getBoard(owner, retroId);
      const here = refreshed.columns[0]!.cards[0]!.id;
      const there = refreshed.columns[1]!.cards[0]!.id;

      await expect(
        harness.container.clusterManager.group(owner, retroId, here, there),
      ).rejects.toThrow('same column');
    });

    it('dissolves the cluster when only one note would be left', async () => {
      const [first, second] = await cardIds();

      await harness.container.clusterManager.group(owner, retroId, first!, second!);

      const board = await harness.container.clusterManager.ungroup(owner, retroId, first!);

      expect(board.columns[0]!.cards).toHaveLength(2);
      expect(board.columns[0]!.cards.every((card) => card.type === 'note')).toBe(true);
    });

    it('keeps the cluster alive when two notes remain', async () => {
      await harness.container.retroManager.updateRetro(owner, retroId, {phase: 'BRAINSTORM'});
      await harness.container.noteManager.create(owner, retroId, columnId, 'c');
      await setPhase('SHARE');

      const [first, second, third] = await cardIds();

      await harness.container.clusterManager.group(owner, retroId, first!, second!);

      const refreshed = await harness.container.retroManager.getBoard(owner, retroId);
      const cluster = refreshed.columns[0]!.cards.find((card) => card.type === 'cluster')!;

      await harness.container.clusterManager.group(owner, retroId, third!, cluster.id);

      const board = await harness.container.clusterManager.ungroup(owner, retroId, third!);
      const survivor = board.columns[0]!.cards.find((card) => card.type === 'cluster');

      expect(survivor?.notes).toHaveLength(2);
    });

    it('dissolves a cluster left with one note after a delete', async () => {
      const [first, second] = await cardIds();

      await harness.container.clusterManager.group(owner, retroId, first!, second!);

      const board = await harness.container.noteManager.remove(owner, retroId, first!);

      expect(board.columns[0]!.cards).toHaveLength(1);
      expect(board.columns[0]!.cards[0]!.type).toBe('note');
    });

    it('takes a note out of its cluster when it changes column', async () => {
      const [first, second] = await cardIds();
      const other = (await harness.container.retroManager.getBoard(owner, retroId)).columns[1]!.id;

      await harness.container.clusterManager.group(owner, retroId, first!, second!);

      const board = await harness.container.noteManager.update(owner, retroId, first!, {
        columnId: other,
      });

      expect(board.columns[0]!.cards.map((card) => card.type)).toEqual(['note']);
      expect(board.columns[1]!.cards.map((card) => card.type)).toEqual(['note']);
    });

    it('refuses a note that is not grouped', async () => {
      const [first] = await cardIds();

      await expect(
        harness.container.clusterManager.ungroup(owner, retroId, first!),
      ).rejects.toThrow('does not belong to a cluster');
    });
  });

  describe('votes', () => {
    beforeEach(async () => {
      await harness.container.noteManager.create(owner, retroId, columnId, 'a');
      await harness.container.noteManager.create(owner, retroId, columnId, 'b');
      await setPhase('SHARE');
      await setPhase('VOTE');
    });

    it('allows stacking several votes on the same card', async () => {
      const [first] = await cardIds();

      await harness.container.voteManager.cast(owner, retroId, first!, 1);
      const board = await harness.container.voteManager.cast(owner, retroId, first!, 1);

      expect(board.myVotesLeft).toBe(3);
      expect(board.columns[0]!.cards.find((card) => card.id === first)!.myVotes).toBe(2);
    });

    it('counts the quota across every card, not per card', async () => {
      const [first, second] = await cardIds();

      for (let index = 0; index < 3; index += 1) {
        await harness.container.voteManager.cast(owner, retroId, first!, 1);
      }

      await harness.container.voteManager.cast(owner, retroId, second!, 1);
      const board = await harness.container.voteManager.cast(owner, retroId, second!, 1);

      expect(board.myVotesLeft).toBe(0);

      await expect(
        harness.container.voteManager.cast(owner, retroId, second!, 1),
      ).rejects.toThrow('No vote left');
    });

    it('ignores the votes of other participants in the quota', async () => {
      const [first] = await cardIds();

      await harness.container.voteManager.cast(member, retroId, first!, 1);

      const board = await harness.container.retroManager.getBoard(owner, retroId);

      expect(board.myVotesLeft).toBe(5);
      expect(board.columns[0]!.cards.find((card) => card.id === first)!.myVotes).toBe(0);
    });

    it('refuses to take back a vote that was never cast', async () => {
      const [first] = await cardIds();

      await expect(
        harness.container.voteManager.cast(owner, retroId, first!, -1),
      ).rejects.toThrow('No vote to take back');
    });

    it('refuses a vote on a note that belongs to a cluster', async () => {
      await harness.container.retroManager.updateRetro(owner, retroId, {phase: 'SHARE'});

      const [first, second] = await cardIds();

      await harness.container.clusterManager.group(owner, retroId, first!, second!);
      await setPhase('VOTE');

      await expect(
        harness.container.voteManager.cast(owner, retroId, first!, 1),
      ).rejects.toThrow('Vote for the cluster');
    });

    it('reveals the totals and sorts the cards once the discussion starts', async () => {
      const [first, second] = await cardIds();

      await harness.container.voteManager.cast(owner, retroId, second!, 1);
      await harness.container.voteManager.cast(member, retroId, second!, 1);
      await harness.container.voteManager.cast(owner, retroId, first!, 1);

      const board = await setPhase('DISCUSS');

      expect(board.columns[0]!.cards[0]!.id).toBe(second);
      expect(board.columns[0]!.cards[0]!.totalVotes).toBe(2);
      expect(board.columns[0]!.cards[1]!.totalVotes).toBe(1);
    });
  });

  describe('actions', () => {
    it('carries open actions over to the next retro and leaves closed ones behind', async () => {
      await setPhase('SHARE');
      await setPhase('VOTE');
      await setPhase('DISCUSS');

      const open = await harness.container.actionManager.create(owner, retroId, 'still open');
      const done = await harness.container.actionManager.create(owner, retroId, 'finished');

      await harness.container.actionManager.update(owner, teamId, done.id, {status: 'DONE'});

      const next = await harness.container.retroManager.create(owner, teamId, 'Sprint 43');

      expect(next.carriedOverActions.map((action) => action.id)).toEqual([open.id]);
      expect(next.actions).toHaveLength(0);
    });

    it('keeps this retro actions apart whatever their status', async () => {
      await setPhase('SHARE');
      await setPhase('VOTE');
      await setPhase('DISCUSS');

      const action = await harness.container.actionManager.create(owner, retroId, 'thing');

      await harness.container.actionManager.update(owner, teamId, action.id, {status: 'DROPPED'});

      const board = await harness.container.retroManager.getBoard(owner, retroId);

      expect(board.actions).toHaveLength(1);
      expect(board.actions[0]!.status).toBe('DROPPED');
    });

    it('follows a retro rename instead of freezing the old title', async () => {
      await setPhase('SHARE');
      await setPhase('VOTE');
      await setPhase('DISCUSS');

      const action = await harness.container.actionManager.create(owner, retroId, 'thing');
      expect(action.retroTitle).toBe('Sprint 42');

      await harness.container.retroManager.updateRetro(owner, retroId, {title: 'Renamed'});

      const actions = await harness.container.actionManager.listByTeam(owner, teamId);

      expect(actions[0]!.retroTitle).toBe('Renamed');
    });

    it('refuses to assign somebody outside the team', async () => {
      await setPhase('SHARE');
      await setPhase('VOTE');
      await setPhase('DISCUSS');

      const orgId = owner.orgId;
      const outsider = await harness.createUser(orgId, 'Bob');

      await expect(
        harness.container.actionManager.create(owner, retroId, 'thing', outsider.userId),
      ).rejects.toThrow('member of the team');
    });

    it('closes an action whatever the phase of its retro', async () => {
      await setPhase('SHARE');
      await setPhase('VOTE');
      await setPhase('DISCUSS');

      const action = await harness.container.actionManager.create(owner, retroId, 'thing');

      await setPhase('ARCHIVED');

      await expect(
        harness.container.actionManager.update(owner, teamId, action.id, {status: 'DONE'}),
      ).resolves.toMatchObject({status: 'DONE'});
    });

    it('survives the deletion of the retro that produced it', async () => {
      await setPhase('SHARE');
      await setPhase('VOTE');
      await setPhase('DISCUSS');

      await harness.container.actionManager.create(owner, retroId, 'outlives the retro');
      await harness.container.retroManager.remove(owner, retroId);

      const actions = await harness.container.actionManager.listByTeam(owner, teamId);

      expect(actions).toHaveLength(1);
      expect(actions[0]!.retroId).toBeUndefined();
    });
  });

  describe('timer', () => {
    const timer = (action: 'start' | 'pause' | 'resume' | 'extend' | 'stop', seconds?: number) =>
      harness.container.retroManager.updateRetro(owner, retroId, {
        timer: seconds === undefined ? {action} : {action, seconds},
      });

    it('turns a duration into an absolute deadline', async () => {
      const board = await timer('start', 300);

      expect(board.timer.state).toBe('RUNNING');
      expect(new Date(board.timer.endsAt!).getTime()).toBeGreaterThan(Date.now());
    });

    it('freezes what is left on the clock when paused, and hands back a deadline on resume', async () => {
      await timer('start', 300);

      const paused = await timer('pause');
      expect(paused.timer.state).toBe('PAUSED');
      expect(paused.timer.remainingMs).toBeGreaterThan(0);

      const resumed = await timer('resume');
      expect(resumed.timer.state).toBe('RUNNING');
    });

    it('refuses to pause a timer that is not running', async () => {
      await expect(timer('pause')).rejects.toThrow('not running');
    });

    it('refuses to resume a timer that is not paused', async () => {
      await timer('start', 300);

      await expect(timer('resume')).rejects.toThrow('not paused');
    });

    it('refuses to start without a duration', async () => {
      await expect(timer('start')).rejects.toThrow('needs a duration');
    });

    it('extends the frozen duration when paused', async () => {
      await timer('start', 300);
      const paused = await timer('pause');
      const extended = await timer('extend', 60);

      expect(extended.timer.remainingMs).toBeGreaterThan(paused.timer.remainingMs!);
    });

    it('stops back to idle', async () => {
      await timer('start', 300);

      expect((await timer('stop')).timer.state).toBe('IDLE');
    });
  });
});
