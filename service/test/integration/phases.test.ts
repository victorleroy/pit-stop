import {Harness} from '../helpers/harness';
import type {AuthContext} from '~/Security/AuthContext';

/** BEHAVIOUR.md section 3: the phase matrix, and the two rules that are easy to lose. */
describe('phases', () => {
  let harness: Harness;
  let facilitator: AuthContext;
  let member: AuthContext;
  let retroId: string;
  let columnId: string;

  beforeEach(async () => {
    harness = Harness.create();

    const orgId = await harness.createOrg();
    facilitator = await harness.createUser(orgId, 'Victor', 'admin');
    member = await harness.createUser(orgId, 'Alice');

    const teamId = await harness.createTeam(facilitator, [member]);
    const board = await harness.container.retroManager.create(facilitator, teamId, 'Sprint 42');

    retroId = board.id;
    columnId = board.columns[0]!.id;
  });

  afterEach(async () => harness.destroy());

  const setPhase = (phase: 'BRAINSTORM' | 'SHARE' | 'VOTE' | 'DISCUSS' | 'ARCHIVED') =>
    harness.container.retroManager.updateRetro(facilitator, retroId, {phase});

  const addNote = (text = 'note') =>
    harness.container.noteManager.create(facilitator, retroId, columnId, text);

  it('creates the three default columns', async () => {
    const board = await harness.container.retroManager.getBoard(facilitator, retroId);

    expect(board.columns.map((column) => column.title)).toEqual(['Start', 'Stop', 'Continue']);
  });

  it('allows writing only during the brainstorm', async () => {
    await expect(addNote()).resolves.toBeDefined();

    await setPhase('SHARE');

    await expect(addNote()).rejects.toThrow('not allowed during the "SHARE" phase');
  });

  it('allows grouping only while sharing', async () => {
    await addNote('a');
    await addNote('b');

    const brainstorm = await harness.container.retroManager.getBoard(facilitator, retroId);
    const [first, second] = brainstorm.columns[0]!.cards;

    await expect(
      harness.container.clusterManager.group(facilitator, retroId, first!.id, second!.id),
    ).rejects.toThrow('not allowed during the "BRAINSTORM" phase');
  });

  it('allows revealing only from SHARE onwards', async () => {
    await expect(
      harness.container.noteManager.setMineRevealed(facilitator, retroId, true),
    ).rejects.toThrow('not allowed during the "BRAINSTORM" phase');

    await setPhase('SHARE');

    await expect(
      harness.container.noteManager.setMineRevealed(facilitator, retroId, true),
    ).resolves.toBeDefined();
  });

  it('is refused to a participant who is not the facilitator', async () => {
    await expect(
      harness.container.retroManager.updateRetro(member, retroId, {phase: 'SHARE'}),
    ).rejects.toThrow('Only the facilitator');
  });

  it('refuses to touch an archived retro without reopening it', async () => {
    await setPhase('ARCHIVED');

    await expect(
      harness.container.retroManager.updateRetro(facilitator, retroId, {title: 'renamed'}),
    ).rejects.toThrow('Reopen the retro');
  });

  it('refuses a rename slipped into the reopening of an archived retro', async () => {
    await setPhase('ARCHIVED');

    await expect(
      harness.container.retroManager.updateRetro(facilitator, retroId, {
        phase: 'ARCHIVED',
        title: 'renamed',
      }),
    ).rejects.toMatchObject({status: 409});
  });

  it('answers a change to an archived board with a conflict', async () => {
    await setPhase('ARCHIVED');

    await expect(addNote()).rejects.toMatchObject({status: 409});
  });

  it('keeps the votes when the same request carries a refused timer action', async () => {
    await addNote('a');
    await setPhase('SHARE');
    await setPhase('VOTE');

    const voting = await harness.container.retroManager.getBoard(facilitator, retroId);

    await harness.container.voteManager.cast(facilitator, retroId, voting.columns[0]!.cards[0]!.id, 1);

    await expect(
      harness.container.retroManager.updateRetro(facilitator, retroId, {
        phase: 'SHARE',
        timer: {action: 'pause'},
      }),
    ).rejects.toThrow();

    const after = await harness.container.retroManager.getBoard(facilitator, retroId);

    expect(after.phase).toBe('VOTE');
    expect(after.myVotesLeft).toBe(4);
  });

  it('reopens an archived retro', async () => {
    await setPhase('ARCHIVED');

    const board = await setPhase('DISCUSS');

    expect(board.phase).toBe('DISCUSS');
  });

  it('wipes the votes when walking back from a voting phase', async () => {
    await addNote('a');
    await setPhase('SHARE');
    await setPhase('VOTE');

    const voting = await harness.container.retroManager.getBoard(facilitator, retroId);
    const card = voting.columns[0]!.cards[0]!;

    await harness.container.voteManager.cast(facilitator, retroId, card.id, 1);

    const spent = await harness.container.retroManager.getBoard(facilitator, retroId);
    expect(spent.myVotesLeft).toBe(4);

    await setPhase('SHARE');

    const reopened = await harness.container.retroManager.getBoard(facilitator, retroId);
    expect(reopened.myVotesLeft).toBe(5);
  });

  it('keeps the votes when moving forward between voting phases', async () => {
    await addNote('a');
    await setPhase('SHARE');
    await setPhase('VOTE');

    const voting = await harness.container.retroManager.getBoard(facilitator, retroId);

    await harness.container.voteManager.cast(facilitator, retroId, voting.columns[0]!.cards[0]!.id, 1);

    const discuss = await setPhase('DISCUSS');

    expect(discuss.myVotesLeft).toBe(4);
  });

  it('hides the totals while people are still voting and reveals them in DISCUSS', async () => {
    await addNote('a');
    await setPhase('SHARE');
    await setPhase('VOTE');

    const voting = await harness.container.retroManager.getBoard(facilitator, retroId);
    expect(voting.votesRevealed).toBe(false);
    expect(voting.columns[0]!.cards[0]!.totalVotes).toBeUndefined();

    const discuss = await setPhase('DISCUSS');
    expect(discuss.votesRevealed).toBe(true);
    expect(discuss.columns[0]!.cards[0]!.totalVotes).toBe(0);
  });

  it('lets columns be edited only during the brainstorm', async () => {
    await expect(
      harness.container.retroManager.addColumn(facilitator, retroId, 'Extra'),
    ).resolves.toBeDefined();

    await setPhase('SHARE');

    await expect(
      harness.container.retroManager.renameColumn(facilitator, retroId, columnId, 'Nope'),
    ).rejects.toThrow('not allowed during the "SHARE" phase');
  });

  it('refuses to drop a column that still holds notes', async () => {
    await addNote('a');

    await expect(
      harness.container.retroManager.removeColumn(facilitator, retroId, columnId),
    ).rejects.toThrow('Move or delete its notes');
  });

  it('drops an empty column', async () => {
    const board = await harness.container.retroManager.removeColumn(facilitator, retroId, columnId);

    expect(board.columns).toHaveLength(2);
  });

  describe('votes per person', () => {
    const setMaxVotes = (maxVotes: number) =>
      harness.container.retroManager.updateRetro(facilitator, retroId, {maxVotes});

    it('takes the budget given at creation', async () => {
      const teamId = (await harness.container.retroManager.getBoard(facilitator, retroId)).teamId;
      const board = await harness.container.retroManager.create(
        facilitator,
        teamId,
        'Sprint 43',
        undefined,
        3,
      );

      expect(board).toMatchObject({maxVotes: 3, myVotesLeft: 3});
    });

    it('can change during the brainstorm and while sharing', async () => {
      await expect(setMaxVotes(8)).resolves.toMatchObject({maxVotes: 8, myVotesLeft: 8});

      await setPhase('SHARE');

      await expect(setMaxVotes(2)).resolves.toMatchObject({maxVotes: 2});
    });

    it('is frozen once voting has started', async () => {
      await setPhase('SHARE');
      await setPhase('VOTE');

      await expect(setMaxVotes(8)).rejects.toMatchObject({status: 409});
    });

    it('cannot change on the way into the vote', async () => {
      await setPhase('SHARE');

      await expect(
        harness.container.retroManager.updateRetro(facilitator, retroId, {
          maxVotes: 10,
          phase: 'VOTE',
        }),
      ).rejects.toMatchObject({status: 409});
    });

    it('can change on the way back to the brainstorm', async () => {
      await setPhase('SHARE');
      await setPhase('VOTE');

      await expect(
        harness.container.retroManager.updateRetro(facilitator, retroId, {
          maxVotes: 2,
          phase: 'BRAINSTORM',
        }),
      ).resolves.toMatchObject({maxVotes: 2, phase: 'BRAINSTORM'});
    });

    it('is refused on an archived retro', async () => {
      await setPhase('ARCHIVED');

      await expect(setMaxVotes(8)).rejects.toThrow('Reopen the retro');
    });

    it('caps the votes each person can cast', async () => {
      await setMaxVotes(1);
      await addNote('a');
      await setPhase('SHARE');
      await setPhase('VOTE');

      const voting = await harness.container.retroManager.getBoard(facilitator, retroId);
      const cardId = voting.columns[0]!.cards[0]!.id;

      await harness.container.voteManager.cast(facilitator, retroId, cardId, 1);

      await expect(
        harness.container.voteManager.cast(facilitator, retroId, cardId, 1),
      ).rejects.toMatchObject({status: 409});
    });
  });

  describe('blank retro', () => {
    let blankId: string;

    beforeEach(async () => {
      const {teamId} = await harness.container.retroManager.getBoard(facilitator, retroId);
      const board = await harness.container.retroManager.create(facilitator, teamId, 'Blank', []);

      blankId = board.id;
    });

    it('starts with no column', async () => {
      const board = await harness.container.retroManager.getBoard(facilitator, blankId);

      expect(board.columns).toEqual([]);
    });

    it('stays in the brainstorm until a column exists', async () => {
      await expect(
        harness.container.retroManager.updateRetro(facilitator, blankId, {phase: 'SHARE'}),
      ).rejects.toThrow('Add at least one column first');

      await harness.container.retroManager.addColumn(facilitator, blankId, 'Wins');

      await expect(
        harness.container.retroManager.updateRetro(facilitator, blankId, {phase: 'SHARE'}),
      ).resolves.toMatchObject({phase: 'SHARE'});
    });
  });

  it('allows creating an action only while discussing', async () => {
    await expect(
      harness.container.actionManager.create(facilitator, retroId, 'do the thing'),
    ).rejects.toThrow('not allowed during the "BRAINSTORM" phase');

    await setPhase('DISCUSS');

    await expect(
      harness.container.actionManager.create(facilitator, retroId, 'do the thing'),
    ).resolves.toMatchObject({status: 'OPEN', text: 'do the thing'});
  });
});
