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
    const board = await harness.container.retroManager.create(author, teamId, 'Sprint 42');

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
});
