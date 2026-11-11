import {Harness} from '../helpers/harness';
import type {AuthContext} from '~/Security/AuthContext';

/**
 * The golden tests of BEHAVIOUR.md section 4. This is the product's central promise, so it is
 * pinned first and in the most literal way possible: what the service hands to a recipient,
 * phase by phase.
 */
describe('anonymity', () => {
  let harness: Harness;
  let author: AuthContext;
  let other: AuthContext;
  let retroId: string;
  let columnId: string;

  beforeEach(async () => {
    harness = Harness.create();

    const orgId = await harness.createOrg();
    author = await harness.createUser(orgId, 'Victor', 'admin');
    other = await harness.createUser(orgId, 'Alice');

    const teamId = await harness.createTeam(author, [other]);
    const board = await harness.createStartedRetro(author, teamId, 'Sprint 42');

    retroId = board.id;
    columnId = board.columns[0]!.id;

    await harness.container.noteManager.create(author, retroId, columnId, 'the secret');
  });

  afterEach(async () => harness.destroy());

  const noteFor = async (auth: AuthContext) => {
    const board = await harness.container.retroManager.getBoard(auth, retroId);

    return board.columns[0]!.cards[0]!.notes[0]!;
  };

  const setPhase = async (phase: 'SHARE' | 'VOTE' | 'DISCUSS' | 'ARCHIVED') => {
    await harness.container.retroManager.updateRetro(author, retroId, {phase});
  };

  it('shows that somebody else wrote a note without its text', async () => {
    const note = await noteFor(other);

    expect(note.author.name).toBe('Victor');
    expect(note.revealed).toBe(false);
    expect(note.text).toBe('');
    expect(note.isMine).toBe(false);
  });

  it('gives the author picture with the author, in every phase', async () => {
    await harness.container.db
      .updateTable('users')
      .set({pictureUrl: 'https://img.test/victor.png'})
      .where('id', '=', author.userId)
      .execute();

    for (const phase of ['SHARE', 'VOTE', 'DISCUSS', 'ARCHIVED'] as const) {
      await setPhase(phase);

      expect((await noteFor(other)).author.pictureUrl).toBe('https://img.test/victor.png');
    }
  });

  it('gives a hidden note the author new avatar, never its text', async () => {
    await harness.container.profileManager.uploadAvatar(
      author,
      'image/jpeg',
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]),
    );

    const note = await noteFor(other);

    expect(note.text).toBe('');
    expect(note.author.pictureUrl).toMatch(/^\/api\/avatars\/av_/);
  });

  it('omits the author picture when the user has none', async () => {
    expect('pictureUrl' in (await noteFor(other)).author).toBe(false);
  });

  it('never leaks the text of another participant', async () => {
    const board = await harness.container.retroManager.getBoard(other, retroId);

    expect(JSON.stringify(board)).not.toContain('the secret');
  });

  it('always gives the author their own text back', async () => {
    const note = await noteFor(author);

    expect(note.text).toBe('the secret');
    expect(note.isMine).toBe(true);
  });

  it('withholds the text of an unshared note during SHARE, never its author', async () => {
    await setPhase('SHARE');

    const note = await noteFor(other);

    expect(note.author.name).toBe('Victor');
    expect(note.text).toBe('');
  });

  it('gives out the text once its author has shared it', async () => {
    await setPhase('SHARE');
    await harness.container.noteManager.setMineRevealed(author, retroId, true);

    const note = await noteFor(other);

    expect(note.revealed).toBe(true);
    expect(note.text).toBe('the secret');
  });

  it('takes the text back when the author changes their mind', async () => {
    await setPhase('SHARE');
    await harness.container.noteManager.setMineRevealed(author, retroId, true);
    await harness.container.noteManager.setMineRevealed(author, retroId, false);

    expect((await noteFor(other)).text).toBe('');
  });

  it('is idempotent when sharing twice', async () => {
    await setPhase('SHARE');
    await harness.container.noteManager.setMineRevealed(author, retroId, true);
    await harness.container.noteManager.setMineRevealed(author, retroId, true);

    expect((await noteFor(other)).text).toBe('the secret');
  });

  it('shares every note of the caller at once, not one by one', async () => {
    await harness.container.noteManager.create(author, retroId, columnId, 'second');
    await setPhase('SHARE');
    await harness.container.noteManager.setMineRevealed(author, retroId, true);

    const board = await harness.container.retroManager.getBoard(other, retroId);
    const texts = board.columns[0]!.cards.flatMap((card) => card.notes.map((note) => note.text));

    expect(texts.sort()).toEqual(['second', 'the secret']);
  });

  describe('sharing one note at a time', () => {
    const textsFor = async (auth: AuthContext) => {
      const board = await harness.container.retroManager.getBoard(auth, retroId);

      return board.columns[0]!.cards.flatMap((card) => card.notes.map(({text}) => text));
    };

    const firstNoteId = async () =>
      (await harness.container.retroManager.getBoard(author, retroId)).columns[0]!.cards
        .flatMap((card) => card.notes)
        .find(({text}) => text === 'the secret')!.id;

    it('refuses it during the brainstorm', async () => {
      await expect(
        harness.container.noteManager.setRevealed(author, retroId, await firstNoteId(), true),
      ).rejects.toThrow('not allowed during the "BRAINSTORM" phase');
      expect(await textsFor(other)).toEqual(['']);
    });

    for (const phase of ['SHARE', 'VOTE', 'DISCUSS'] as const) {
      it(`gives out only that note during ${phase}, and takes it back`, async () => {
        await harness.container.noteManager.create(author, retroId, columnId, 'still mine');
        const noteId = await firstNoteId();
        await setPhase(phase);

        await harness.container.noteManager.setRevealed(author, retroId, noteId, true);

        expect((await textsFor(other)).sort()).toEqual(['', 'the secret']);
        expect(JSON.stringify(await harness.container.retroManager.getBoard(other, retroId))).not.toContain(
          'still mine',
        );

        await harness.container.noteManager.setRevealed(author, retroId, noteId, false);

        expect(await textsFor(other)).toEqual(['', '']);
      });
    }

    it('refuses it on an archived retro', async () => {
      const noteId = await firstNoteId();
      await setPhase('ARCHIVED');

      await expect(
        harness.container.noteManager.setRevealed(author, retroId, noteId, true),
      ).rejects.toThrow('Reopen the retro');
      expect(await textsFor(other)).toEqual(['']);
    });

    it('is refused to anybody but the author, facilitator included', async () => {
      const authorsNote = await firstNoteId();
      await harness.container.noteManager.create(other, retroId, columnId, 'alice only');
      const othersNote = (await harness.container.retroManager.getBoard(other, retroId)).columns[0]!.cards
        .flatMap((card) => card.notes)
        .find(({isMine}) => isMine)!.id;
      await setPhase('SHARE');

      await expect(
        harness.container.noteManager.setRevealed(other, retroId, authorsNote, true),
      ).rejects.toThrow('Only the author');
      await expect(
        harness.container.noteManager.setRevealed(author, retroId, othersNote, true),
      ).rejects.toThrow('Only the author');

      expect(JSON.stringify(await harness.container.retroManager.getBoard(other, retroId))).not.toContain(
        'the secret',
      );
      expect(JSON.stringify(await harness.container.retroManager.getBoard(author, retroId))).not.toContain(
        'alice only',
      );
    });
  });

  it('reports myNotesRevealed only for the caller', async () => {
    await setPhase('SHARE');
    await harness.container.noteManager.setMineRevealed(author, retroId, true);

    const mine = await harness.container.retroManager.getBoard(author, retroId);
    const theirs = await harness.container.retroManager.getBoard(other, retroId);

    expect(mine.myNotesRevealed).toBe(true);
    expect(theirs.myNotesRevealed).toBe(false);
  });

  it('refuses to rewrite a note whose text was never shared, even for the facilitator', async () => {
    const note = await noteFor(author);

    await harness.container.adminManager.handOverFacilitation(author, retroId, other.userId);

    await expect(
      harness.container.noteManager.update(other, retroId, note.id, {text: 'rewritten'}),
    ).rejects.toThrow('has not been shared yet');
  });

  it('still lets the facilitator move a withheld note to another column', async () => {
    const note = await noteFor(author);

    await harness.container.adminManager.handOverFacilitation(author, retroId, other.userId);

    const board = await harness.container.retroManager.getBoard(author, retroId);
    const target = board.columns[1]!.id;

    await expect(
      harness.container.noteManager.update(other, retroId, note.id, {columnId: target}),
    ).resolves.toBeDefined();
  });

  it('gives the column prompts and the template to everybody alike, in every phase', async () => {
    const bob = await harness.createUser(author.orgId, 'Bob');
    const {teamId} = await harness.container.retroManager.getBoard(author, retroId);

    await harness.container.teamManager.addMember(author, teamId, bob.userId);
    await harness.container.noteManager.create(other, retroId, columnId, 'alice note');

    const metadataFor = async (auth: AuthContext) => {
      const board = await harness.container.retroManager.getBoard(auth, retroId);

      return {prompts: board.columns.map(({prompt}) => prompt), template: board.template};
    };

    for (const phase of ['BRAINSTORM', 'SHARE', 'VOTE', 'DISCUSS', 'ARCHIVED'] as const) {
      if (phase !== 'BRAINSTORM') {
        await setPhase(phase);
      }

      const [ofAuthor, ofParticipant, ofFacilitator] = await Promise.all(
        [other, bob, author].map(metadataFor),
      );

      expect(ofAuthor).toEqual({
        prompts: [
          'Something we should try next sprint',
          'Something that costs us more than it gives',
          'Something that works and must stay',
        ],
        template: {id: 'builtin:start-stop-continue', name: 'Start / Stop / Continue'},
      });
      expect(ofParticipant).toEqual(ofAuthor);
      expect(ofFacilitator).toEqual(ofAuthor);
    }
  });

  describe('vote progress', () => {
    const castOnFirstCard = async (auth: AuthContext) => {
      const board = await harness.container.retroManager.getBoard(auth, retroId);

      await harness.container.voteManager.cast(auth, retroId, board.columns[0]!.cards[0]!.id, 1);
    };

    it('is empty before the vote', async () => {
      expect((await harness.container.retroManager.getBoard(other, retroId)).voteProgress).toEqual({});

      await setPhase('SHARE');

      expect((await harness.container.retroManager.getBoard(other, retroId)).voteProgress).toEqual({});
    });

    it('tells everybody how many votes each person spent during VOTE, never on what', async () => {
      await setPhase('SHARE');
      await setPhase('VOTE');
      await castOnFirstCard(author);
      await castOnFirstCard(author);

      const board = await harness.container.retroManager.getBoard(other, retroId);

      expect(board.voteProgress).toEqual({[author.userId]: 2});
      expect(board.columns[0]!.cards[0]!.myVotes).toBe(0);
      expect(board.columns[0]!.cards[0]!.totalVotes).toBeUndefined();
    });

    it('is empty again once the vote is over', async () => {
      await setPhase('SHARE');
      await setPhase('VOTE');
      await castOnFirstCard(author);

      await setPhase('DISCUSS');
      expect((await harness.container.retroManager.getBoard(other, retroId)).voteProgress).toEqual({});

      await setPhase('ARCHIVED');
      expect((await harness.container.retroManager.getBoard(other, retroId)).voteProgress).toEqual({});
    });
  });
  it('shows nothing of a board still in its waiting room, and who facilitates to everyone', async () => {
    const {teamId} = await harness.container.retroManager.getBoard(author, retroId);
    const lobby = await harness.container.retroManager.create(author, teamId, 'Sprint 43');

    for (const reader of [author, other]) {
      const board = await harness.container.retroManager.getBoard(reader, lobby.id);

      expect(board).toMatchObject({
        facilitatorId: author.userId,
        phase: 'LOBBY',
        voteProgress: {},
        votesRevealed: false,
      });
      expect(board.columns.flatMap((column) => column.cards)).toEqual([]);
    }
  });

  /** Icebreaker answers are signed: the text is what stays hidden, and only until revealed. */
  describe('icebreaker answers', () => {
    let icebreakerRetroId: string;

    beforeEach(async () => {
      const teamId = (await harness.container.retroManager.getBoard(author, retroId)).teamId;

      icebreakerRetroId = (
        await harness.container.retroManager.create(author, teamId, 'Sprint 43', {icebreaker: true})
      ).id;
    });

    const sessionToken = async (auth: AuthContext): Promise<string> => {
      const row = await harness.container.db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', auth.userId)
        .executeTakeFirstOrThrow();

      return (await harness.container.authManager.issueSession(row)).token;
    };

    /** The same reading through both paths: the HTTP read and the websocket broadcast. */
    const icebreakerFor = async (auth: AuthContext) => {
      const viaHttp = (await harness.container.retroManager.getBoard(auth, icebreakerRetroId)).icebreaker;
      const sent: string[] = [];
      const session = harness.container.hub.acquire(icebreakerRetroId);
      const connection = {
        name: auth.name,
        socket: {close: jest.fn(), OPEN: 1, readyState: 1, send: (raw: string) => sent.push(raw)} as never,
        token: await sessionToken(auth),
        userId: auth.userId,
      };

      session.add(connection);
      await session.broadcastBoard();
      harness.container.hub.release(icebreakerRetroId, connection);

      const viaSocket = JSON.parse(sent.find((raw) => raw.includes('board.updated'))!).board.icebreaker;

      expect(viaSocket).toEqual(viaHttp);

      return viaHttp;
    };

    const enter = (phase: 'ICEBREAKER' | 'BRAINSTORM' | 'SHARE' | 'VOTE' | 'DISCUSS' | 'ARCHIVED') =>
      harness.container.retroManager.updateRetro(author, icebreakerRetroId, {phase});

    it('shows the question to nobody in the waiting room, the facilitator included', async () => {
      expect((await icebreakerFor(author))?.question).toBeNull();
      expect((await icebreakerFor(other))?.question).toBeNull();
    });

    it('hides the text of an unshared answer from everyone but its author, in every phase', async () => {
      await enter('ICEBREAKER');
      await harness.container.icebreakerManager.answer(other, icebreakerRetroId, 'Tea');

      const hidden = {author: {id: other.userId, name: 'Alice'}, mine: false, revealed: false, text: ''};

      for (const phase of ['ICEBREAKER', 'BRAINSTORM', 'SHARE', 'VOTE', 'DISCUSS', 'ARCHIVED'] as const) {
        await enter(phase);

        // The facilitator does not read it either.
        expect((await icebreakerFor(author))?.answers).toEqual([hidden]);
        expect((await icebreakerFor(other))?.answers).toEqual([{...hidden, mine: true, text: 'Tea'}]);
      }
    });

    it('shows a shared answer to everyone, in every phase after', async () => {
      await enter('ICEBREAKER');
      await harness.container.icebreakerManager.answer(other, icebreakerRetroId, 'Tea');
      await harness.container.icebreakerManager.setRevealed(other, icebreakerRetroId, true);

      for (const phase of ['ICEBREAKER', 'BRAINSTORM', 'SHARE', 'VOTE', 'DISCUSS', 'ARCHIVED'] as const) {
        await enter(phase);

        expect((await icebreakerFor(author))?.answers[0]?.text).toBe('Tea');
      }
    });
  });
});

