import {Hono} from 'hono';
import {Harness} from '../helpers/harness';
import {errorHandler} from '~/Http/errorHandler';
import type {Variables} from '~/Http/middleware/auth';
import {retroRoutes} from '~/Http/routes/retros';
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
    const board = await harness.createStartedRetro(facilitator, teamId, 'Sprint 42');

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

  it('allows adding a note only during the brainstorm and the share', async () => {
    await expect(addNote()).resolves.toBeDefined();

    await setPhase('SHARE');
    await expect(addNote()).resolves.toBeDefined();

    for (const phase of ['VOTE', 'DISCUSS'] as const) {
      await setPhase(phase);
      await expect(addNote()).rejects.toThrow(`not allowed during the "${phase}" phase`);
    }

    await setPhase('ARCHIVED');
    await expect(addNote()).rejects.toMatchObject({status: 409});
  });

  it('creates a note withheld during the brainstorm and already shared during the share', async () => {
    await harness.container.noteManager.create(member, retroId, columnId, 'written');
    await setPhase('SHARE');
    await harness.container.noteManager.create(member, retroId, columnId, 'said aloud');

    const seenByOther = await harness.container.retroManager.getBoard(facilitator, retroId);

    expect(seenByOther.columns[0]!.cards.map((card) => card.notes[0]!.text).sort()).toEqual([
      '',
      'said aloud',
    ]);
  });

  it('keeps the text of a note added while sharing frozen', async () => {
    await setPhase('SHARE');

    const board = await addNote('said aloud');
    const noteId = board.columns[0]!.cards[0]!.notes[0]!.id;

    await expect(
      harness.container.noteManager.update(facilitator, retroId, noteId, {text: 'rewritten'}),
    ).rejects.toThrow('not allowed during the "SHARE" phase');
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
      harness.container.retroManager.updateColumn(facilitator, retroId, columnId, {title: 'Nope'}),
    ).rejects.toThrow('not allowed during the "SHARE" phase');
  });

  describe('column prompts', () => {
    const setPrompt = (prompt: string | null, auth = facilitator) =>
      harness.container.retroManager.updateColumn(auth, retroId, columnId, {prompt});

    const patch = async (body: unknown) => {
      const app = new Hono<{Variables: Variables}>();

      app.onError(errorHandler);
      app.use('*', async (context, next) => {
        context.set('auth', facilitator);
        await next();
      });
      app.route('/', retroRoutes(harness.container));

      return app.request(`/retros/${retroId}/columns/${columnId}`, {
        body: JSON.stringify(body),
        headers: {'content-type': 'application/json'},
        method: 'PATCH',
      });
    };

    it('lets the facilitator set and clear a prompt during the brainstorm, for everyone', async () => {
      await setPrompt('Be specific');

      const seen = await harness.container.retroManager.getBoard(member, retroId);
      expect(seen.columns[0]).toMatchObject({prompt: 'Be specific', title: 'Start'});

      const cleared = await setPrompt(null);
      expect(cleared.columns[0]).toMatchObject({prompt: null, title: 'Start'});
    });

    it('keeps the prompt when only the title changes', async () => {
      await setPrompt('Be specific');

      const board = await harness.container.retroManager.updateColumn(
        facilitator,
        retroId,
        columnId,
        {title: 'Begin'},
      );

      expect(board.columns[0]).toMatchObject({prompt: 'Be specific', title: 'Begin'});
    });

    it('refuses a prompt change from a participant', async () => {
      await expect(setPrompt('Mine', member)).rejects.toMatchObject({status: 403});
    });

    it('refuses a prompt change outside the brainstorm', async () => {
      for (const phase of ['SHARE', 'VOTE', 'DISCUSS'] as const) {
        await setPhase(phase);
        await expect(setPrompt('Late')).rejects.toThrow(`not allowed during the "${phase}" phase`);
      }

      await setPhase('ARCHIVED');
      await expect(setPrompt('Late')).rejects.toMatchObject({status: 409});
    });

    it('adds a column with its prompt', async () => {
      const board = await harness.container.retroManager.addColumn(
        facilitator,
        retroId,
        'Extra',
        'Anything else',
      );

      expect(board.columns.at(-1)).toMatchObject({prompt: 'Anything else', title: 'Extra'});
    });

    it('refuses a change with neither title nor prompt, or a prompt over 140 characters', async () => {
      expect((await patch({})).status).toBe(400);
      expect((await patch({prompt: 'x'.repeat(141)})).status).toBe(400);
      expect((await patch({title: ''})).status).toBe(400);
    });

    it('clears the prompt from a blank text over HTTP', async () => {
      await setPrompt('Be specific');

      const response = await patch({prompt: '   '});
      const board = (await response.json()) as {columns: {prompt: string | null; title: string}[]};

      expect(response.status).toBe(200);
      expect(board.columns[0]).toMatchObject({prompt: null, title: 'Start'});
    });
  });

  describe('column order', () => {
    const reorder = (auth: AuthContext, ids: string[]) =>
      harness.container.retroManager.reorderColumns(auth, retroId, ids);

    const currentIds = async () =>
      (await harness.container.retroManager.getBoard(facilitator, retroId)).columns.map(
        ({id}) => id,
      );

    it('lets the facilitator reorder the columns during the brainstorm, for everyone', async () => {
      const [start, stop, keep] = await currentIds();

      await reorder(facilitator, [keep!, start!, stop!]);

      const seen = await harness.container.retroManager.getBoard(member, retroId);
      expect(seen.columns.map(({title}) => title)).toEqual(['Continue', 'Start', 'Stop']);
      expect(seen.columns.map(({order}) => order)).toEqual([0, 1, 2]);
    });

    it('keeps the new order for a column added afterwards', async () => {
      const [start, stop, keep] = await currentIds();

      await reorder(facilitator, [keep!, start!, stop!]);
      const board = await harness.container.retroManager.addColumn(facilitator, retroId, 'Extra');

      expect(board.columns.map(({title}) => title)).toEqual(['Continue', 'Start', 'Stop', 'Extra']);
    });

    it('is refused to a participant who is not the facilitator', async () => {
      const ids = await currentIds();

      await expect(reorder(member, [...ids].reverse())).rejects.toThrow();
      expect(await currentIds()).toEqual(ids);
    });

    it('refuses an order that does not list every column exactly once', async () => {
      const [start, stop, keep] = await currentIds();

      await expect(reorder(facilitator, [keep!, start!])).rejects.toThrow('every column');
      await expect(reorder(facilitator, [keep!, start!, start!])).rejects.toThrow('every column');
      await expect(reorder(facilitator, [keep!, start!, 'nope'])).rejects.toThrow('every column');
      expect(await currentIds()).toEqual([start, stop, keep]);
    });

    it.each(['SHARE', 'VOTE', 'DISCUSS'] as const)('is refused during %s', async (phase) => {
      const ids = await currentIds();

      await setPhase(phase);

      await expect(reorder(facilitator, [...ids].reverse())).rejects.toThrow(
        `not allowed during the "${phase}" phase`,
      );
    });

    it('is refused on an archived retro', async () => {
      const ids = await currentIds();

      await setPhase('ARCHIVED');

      await expect(reorder(facilitator, [...ids].reverse())).rejects.toThrow();
    });
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
      const board = await harness.createStartedRetro(
        facilitator,
        teamId,
        'Sprint 43',
        {maxVotes: 3},
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
      const board = await harness.createStartedRetro(facilitator, teamId, 'Blank', {columns: []});

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
  /** BEHAVIOUR.md section 3: a retro opens in its waiting room and never comes back to it. */
  describe('waiting room', () => {
    let lobbyId: string;
    let lobbyColumnId: string;
    let teamId: string;

    const lobbyPhase = (phase: 'LOBBY' | 'BRAINSTORM' | 'SHARE' | 'DISCUSS' | 'ARCHIVED') =>
      harness.container.retroManager.updateRetro(facilitator, lobbyId, {phase});

    beforeEach(async () => {
      ({teamId} = await harness.container.retroManager.getBoard(facilitator, retroId));

      const board = await harness.container.retroManager.create(facilitator, teamId, 'Sprint 43');

      lobbyId = board.id;
      lobbyColumnId = board.columns[0]!.id;
    });

    it('opens every new retro in LOBBY', async () => {
      const board = await harness.container.retroManager.getBoard(member, lobbyId);

      expect(board).toMatchObject({facilitatorId: facilitator.userId, phase: 'LOBBY'});
    });

    it('starts the brainstorm, even on a blank board', async () => {
      await expect(lobbyPhase('BRAINSTORM')).resolves.toMatchObject({phase: 'BRAINSTORM'});

      const blank = await harness.container.retroManager.create(facilitator, teamId, 'Blank', {columns: []});

      await expect(
        harness.container.retroManager.updateRetro(facilitator, blank.id, {phase: 'BRAINSTORM'}),
      ).resolves.toMatchObject({phase: 'BRAINSTORM'});
    });

    it('jumps further only with a column', async () => {
      const blank = await harness.container.retroManager.create(facilitator, teamId, 'Blank', {columns: []});

      await expect(
        harness.container.retroManager.updateRetro(facilitator, blank.id, {phase: 'SHARE'}),
      ).rejects.toThrow('Add at least one column first');
      await expect(lobbyPhase('SHARE')).resolves.toMatchObject({phase: 'SHARE'});
    });

    it('never goes back to LOBBY once left', async () => {
      for (const phase of ['BRAINSTORM', 'DISCUSS', 'ARCHIVED'] as const) {
        await lobbyPhase(phase);
        await expect(lobbyPhase('LOBBY')).rejects.toMatchObject({
          message: 'The retro has already started',
          status: 409,
        });
      }
    });

    it('treats LOBBY to LOBBY as a no-op that still applies the rest', async () => {
      await expect(lobbyPhase('LOBBY')).resolves.toMatchObject({phase: 'LOBBY'});
      await expect(
        harness.container.retroManager.updateRetro(facilitator, lobbyId, {
          phase: 'LOBBY',
          title: 'Renamed',
        }),
      ).resolves.toMatchObject({phase: 'LOBBY', title: 'Renamed'});

      const blank = await harness.container.retroManager.create(facilitator, teamId, 'Blank', {columns: []});

      await expect(
        harness.container.retroManager.updateRetro(facilitator, blank.id, {phase: 'LOBBY'}),
      ).resolves.toMatchObject({phase: 'LOBBY'});
    });

    it('refuses notes, votes and reveals with a 403', async () => {
      await expect(
        harness.container.noteManager.create(facilitator, lobbyId, lobbyColumnId, 'early'),
      ).rejects.toMatchObject({status: 403});
      await expect(
        harness.container.voteManager.cast(facilitator, lobbyId, lobbyColumnId, 1),
      ).rejects.toMatchObject({status: 403});
      await expect(
        harness.container.noteManager.setMineRevealed(facilitator, lobbyId, true),
      ).rejects.toMatchObject({status: 403});
    });

    it('lets the facilitator alone prepare the columns', async () => {
      const added = await harness.container.retroManager.addColumn(facilitator, lobbyId, 'Kudos');
      const kudos = added.columns.at(-1)!.id;

      await expect(
        harness.container.retroManager.updateColumn(facilitator, lobbyId, kudos, {title: 'Thanks'}),
      ).resolves.toBeDefined();
      await expect(
        harness.container.retroManager.removeColumn(facilitator, lobbyId, kudos),
      ).resolves.toBeDefined();
      await expect(
        harness.container.retroManager.addColumn(member, lobbyId, 'Mine'),
      ).rejects.toMatchObject({status: 403});
    });

    it('lets the facilitator change the votes per person', async () => {
      await expect(
        harness.container.retroManager.updateRetro(facilitator, lobbyId, {maxVotes: 7}),
      ).resolves.toMatchObject({maxVotes: 7});
    });

    it('lets only the facilitator start the retro', async () => {
      await expect(
        harness.container.retroManager.updateRetro(member, lobbyId, {phase: 'BRAINSTORM'}),
      ).rejects.toMatchObject({status: 403});
    });
  });

  it('wipes the votes on arriving in the brainstorm or the share, whatever the source', async () => {
    await addNote('a');
    await setPhase('SHARE');
    await setPhase('VOTE');

    const voting = await harness.container.retroManager.getBoard(facilitator, retroId);

    await harness.container.voteManager.cast(facilitator, retroId, voting.columns[0]!.cards[0]!.id, 1);
    await setPhase('SHARE');
    await setPhase('VOTE');

    expect((await harness.container.retroManager.getBoard(facilitator, retroId)).myVotesLeft).toBe(5);
  });
});
