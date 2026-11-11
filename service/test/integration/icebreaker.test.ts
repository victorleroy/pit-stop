import {Hono} from 'hono';
import {Harness} from '../helpers/harness';
import {errorHandler} from '~/Http/errorHandler';
import type {Variables} from '~/Http/middleware/auth';
import {retroRoutes} from '~/Http/routes/retros';
import type {BoardModel} from '~/Model/RetroModel';
import type {AuthContext} from '~/Security/AuthContext';

/** BEHAVIOUR.md section 6, Icebreaker: one question, asked on entering the phase. */
describe('icebreaker', () => {
  let harness: Harness;
  let facilitator: AuthContext;
  let member: AuthContext;
  let teamId: string;

  beforeEach(async () => {
    harness = Harness.create();

    const orgId = await harness.createOrg();
    facilitator = await harness.createUser(orgId, 'Victor', 'admin');
    member = await harness.createUser(orgId, 'Alice');
    teamId = await harness.createTeam(facilitator, [member]);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await harness.destroy();
  });

  const retros = () => harness.container.retroManager;
  const icebreaker = () => harness.container.icebreakerManager;

  const create = async (icebreakerOn = true, title = 'Sprint 42') =>
    retros().create(facilitator, teamId, title, {icebreaker: icebreakerOn});

  const board = (auth: AuthContext, retroId: string) => retros().getBoard(auth, retroId);

  const ask = (retroId: string) => retros().updateRetro(facilitator, retroId, {phase: 'ICEBREAKER'});

  const askedId = async (retroId: string) =>
    (await harness.container.db
      .selectFrom('retros')
      .select(['icebreakerQuestionId', 'icebreakerAskedAt'])
      .where('id', '=', retroId)
      .executeTakeFirstOrThrow());

  const request = (path: string, init: RequestInit, auth: AuthContext = member) => {
    const app = new Hono<{Variables: Variables}>();

    app.use('*', async (context, next) => {
      context.set('auth', auth);
      await next();
    });
    app.route('/', retroRoutes(harness.container));
    app.onError(errorHandler);

    return app.request(path, {headers: {'content-type': 'application/json'}, ...init});
  };

  const json = (body: unknown) => JSON.stringify(body);

  describe('creation', () => {
    it('has no icebreaker unless asked for one', async () => {
      const created = await retros().create(facilitator, teamId, 'Sprint 42');

      expect(created.phase).toBe('LOBBY');
      expect(created.icebreaker).toBeNull();
    });

    it('draws a question in the waiting room, shown to the facilitator alone', async () => {
      const created = await create();

      expect(created.icebreaker).toMatchObject({answeredCount: 0, question: {source: 'BANK'}, state: 'WAITING'});
      expect((await board(member, created.id)).icebreaker).toMatchObject({question: null, state: 'WAITING'});
      expect((await askedId(created.id)).icebreakerAskedAt).toBeNull();
    });

    it('takes the icebreaker flag over HTTP, false meaning none', async () => {
      const on = await request(`/teams/${teamId}/retros`, {body: json({icebreaker: true, title: 'A'}), method: 'POST'}, facilitator);
      const off = await request(`/teams/${teamId}/retros`, {body: json({icebreaker: false, title: 'B'}), method: 'POST'}, facilitator);
      const wrong = await request(`/teams/${teamId}/retros`, {body: json({icebreaker: 'yes', title: 'C'}), method: 'POST'}, facilitator);

      expect(((await on.json()) as BoardModel).icebreaker).not.toBeNull();
      expect(((await off.json()) as BoardModel).icebreaker).toBeNull();
      expect(wrong.status).toBe(400);
    });
  });

  describe('asking', () => {
    it('asks the question on entering ICEBREAKER, once', async () => {
      const {id} = await create();
      const asked = await ask(id);
      const {icebreakerAskedAt} = await askedId(id);

      expect(asked.icebreaker).toMatchObject({question: {source: 'BANK'}, state: 'ASKED'});
      expect((await board(member, id)).icebreaker?.question).not.toBeNull();
      expect(icebreakerAskedAt).not.toBeNull();

      await retros().updateRetro(facilitator, id, {phase: 'BRAINSTORM'});
      await ask(id);

      expect((await askedId(id)).icebreakerAskedAt).toBe(icebreakerAskedAt);
    });

    it('draws a question on entering ICEBREAKER without one', async () => {
      const {id} = await create(false);
      const asked = await ask(id);

      expect(asked.icebreaker).toMatchObject({question: {source: 'BANK'}, state: 'ASKED'});
    });

    it('forgets a question never asked once the retro moves on', async () => {
      const {id} = await create();

      await retros().updateRetro(facilitator, id, {phase: 'BRAINSTORM'});

      expect((await board(facilitator, id)).icebreaker).toBeNull();
    });

    it('lets a board without columns come back to the icebreaker, never past the brainstorm', async () => {
      const {id} = await retros().create(facilitator, teamId, 'Blank', {columns: []});

      await retros().updateRetro(facilitator, id, {phase: 'BRAINSTORM'});
      await ask(id);

      await expect(retros().updateRetro(facilitator, id, {phase: 'SHARE'})).rejects.toMatchObject({status: 409});
    });

    it('lets a board without columns go through the icebreaker to the brainstorm', async () => {
      const {id} = await retros().create(facilitator, teamId, 'Blank', {columns: [], icebreaker: true});

      await ask(id);

      expect((await retros().updateRetro(facilitator, id, {phase: 'BRAINSTORM'})).phase).toBe('BRAINSTORM');
    });
  });

  describe('choosing the question', () => {
    it('draws another question or takes the facilitator own, in the waiting room', async () => {
      const {id} = await create();
      const first = (await board(facilitator, id)).icebreaker?.question;
      const drawn = await icebreaker().command(facilitator, id, 'draw');

      expect(drawn.icebreaker?.question).not.toEqual(first);

      const custom = await icebreaker().command(facilitator, id, 'custom', '  Coffee or tea?  ');

      expect(custom.icebreaker?.question).toEqual({source: 'CUSTOM', text: 'Coffee or tea?'});
      expect((await askedId(id)).icebreakerQuestionId).toBeNull();
    });

    it('adds an icebreaker to a retro created without one', async () => {
      const {id} = await create(false);

      expect((await icebreaker().command(facilitator, id, 'draw')).icebreaker?.state).toBe('WAITING');
    });

    it('is the facilitator own', async () => {
      const {id} = await create();

      expect((await request(`/retros/${id}/icebreaker`, {body: json({action: 'draw'}), method: 'PATCH'})).status).toBe(403);
    });

    it('refuses an empty or over-long question, and an unknown command', async () => {
      const {id} = await create();
      const patch = (body: unknown) =>
        request(`/retros/${id}/icebreaker`, {body: json(body), method: 'PATCH'}, facilitator);

      expect((await patch({action: 'custom', text: '   '})).status).toBe(400);
      expect((await patch({action: 'custom', text: 'x'.repeat(201)})).status).toBe(400);
      expect((await patch({action: 'custom'})).status).toBe(400);
      expect((await patch({action: 'ask'})).status).toBe(400);
      expect((await patch({action: 'custom', text: 'x'.repeat(200)})).status).toBe(200);
    });

    it('clears the answers and hides them again when the asked question changes', async () => {
      const {id} = await create();

      await ask(id);
      await icebreaker().answer(member, id, 'Tea');
      await icebreaker().command(facilitator, id, 'revealAnswers');

      const changed = await icebreaker().command(facilitator, id, 'draw');

      expect(changed.icebreaker).toMatchObject({answeredCount: 0, answers: [], answersRevealed: false, state: 'ASKED'});
    });

    it('is refused outside the waiting room and the icebreaker', async () => {
      const {id} = await create();

      await retros().updateRetro(facilitator, id, {phase: 'BRAINSTORM'});

      await expect(icebreaker().command(facilitator, id, 'draw')).rejects.toMatchObject({status: 403});
    });
  });

  describe('answers', () => {
    let retroId: string;

    beforeEach(async () => {
      retroId = (await create()).id;
    });

    it('cannot be given before the question is asked', async () => {
      expect((await request(`/retros/${retroId}/icebreaker/answer`, {body: json({text: 'Hi'}), method: 'PUT'})).status).toBe(403);
    });

    it('keeps one answer per person, trimmed, the last one winning', async () => {
      await ask(retroId);
      await icebreaker().answer(member, retroId, '  Tea  ');

      const replaced = await icebreaker().answer(member, retroId, 'Coffee');

      expect(replaced.icebreaker?.answers).toEqual([
        {author: {id: member.userId, name: 'Alice'}, mine: true, text: 'Coffee'},
      ]);
    });

    it('refuses an empty or over-long answer', async () => {
      await ask(retroId);

      const put = (text: string) =>
        request(`/retros/${retroId}/icebreaker/answer`, {body: json({text}), method: 'PUT'});

      expect((await put('   ')).status).toBe(400);
      expect((await put('x'.repeat(141))).status).toBe(400);
      expect((await put('x'.repeat(140))).status).toBe(200);
    });

    it('removes an answer, twice without error', async () => {
      await ask(retroId);
      await icebreaker().answer(member, retroId, 'Tea');

      const remove = () => request(`/retros/${retroId}/icebreaker/answer`, {method: 'DELETE'});

      expect((await remove()).status).toBe(200);
      expect(((await (await remove()).json()) as BoardModel).icebreaker?.answeredCount).toBe(0);
    });

    it('are refused once the retro moved on, and frozen in the archive', async () => {
      await ask(retroId);
      await retros().updateRetro(facilitator, retroId, {phase: 'BRAINSTORM'});

      await expect(icebreaker().answer(member, retroId, 'Tea')).rejects.toMatchObject({status: 403});

      await retros().updateRetro(facilitator, retroId, {phase: 'ARCHIVED'});

      for (const attempt of [
        () => icebreaker().answer(member, retroId, 'Tea'),
        () => icebreaker().removeAnswer(member, retroId),
        () => icebreaker().command(facilitator, retroId, 'draw'),
        () => icebreaker().command(facilitator, retroId, 'custom', 'Hi?'),
        () => icebreaker().command(facilitator, retroId, 'revealAnswers'),
        () => icebreaker().command(facilitator, retroId, 'hideAnswers'),
      ]) {
        await expect(attempt()).rejects.toMatchObject({status: 409});
      }
    });

    it('can only be revealed during the icebreaker', async () => {
      await expect(icebreaker().command(facilitator, retroId, 'revealAnswers')).rejects.toMatchObject({status: 403});
    });

    it('are deleted with the retro', async () => {
      await ask(retroId);
      await icebreaker().answer(member, retroId, 'Tea');
      await retros().remove(facilitator, retroId);

      const left = await harness.container.db.selectFrom('icebreakerAnswers').selectAll().execute();

      expect(left).toEqual([]);
    });
  });

  describe('history', () => {
    beforeEach(() => {
      // Always the first candidate: what the draw leaves out is all that varies.
      jest.spyOn(Math, 'random').mockReturnValue(0);
    });

    it('never draws a question the team was asked, or another waiting room holds', async () => {
      const first = await create(true, 'One');
      const second = await create(true, 'Two');

      expect(second.icebreaker?.question).not.toEqual(first.icebreaker?.question);

      await ask(first.id);
      await retros().remove(facilitator, second.id);

      const third = await create(true, 'Three');

      expect(third.icebreaker?.question).not.toEqual(first.icebreaker?.question);
    });

    it('does not count a question skipped by a new draw, or a deleted retro, as asked', async () => {
      const first = await create(true, 'One');
      const skipped = first.icebreaker?.question;

      await icebreaker().command(facilitator, first.id, 'draw');

      expect((await create(true, 'Two')).icebreaker?.question).toEqual(skipped);

      const asked = await ask(first.id);

      await retros().remove(facilitator, first.id);

      const other = await retros().create(facilitator, teamId, 'Three', {icebreaker: true});

      expect([skipped, asked.icebreaker?.question]).toContainEqual(other.icebreaker?.question);
    });

    it('releases the question of a waiting room left without the icebreaker', async () => {
      const first = await create(true, 'One');

      await retros().updateRetro(facilitator, first.id, {phase: 'BRAINSTORM'});

      expect((await create(true, 'Two')).icebreaker?.question).toEqual(first.icebreaker?.question);
    });

    it('is kept per team', async () => {
      const first = await create(true, 'One');

      await ask(first.id);

      const otherTeam = await harness.createTeam(facilitator);
      const elsewhere = await retros().create(facilitator, otherTeam, 'Elsewhere', {icebreaker: true});

      expect(elsewhere.icebreaker?.question).toEqual(first.icebreaker?.question);
    });
  });

  it('gives the preview to whoever takes the facilitation over', async () => {
    const {id} = await create();

    await harness.container.adminManager.takeFacilitation(member, id);

    expect((await board(member, id)).icebreaker?.question).not.toBeNull();
    expect((await board(facilitator, id)).icebreaker?.question).toBeNull();
  });

  it('keeps the votes when going back to the icebreaker, and freezes the budget there', async () => {
    const started = await harness.createStartedRetro(facilitator, teamId, 'Sprint 42');
    const columnId = started.columns[0]!.id;

    await harness.container.noteManager.create(facilitator, started.id, columnId, 'note');
    await retros().updateRetro(facilitator, started.id, {phase: 'VOTE'});

    const noteId = (await board(facilitator, started.id)).columns[0]!.cards[0]!.id;

    await harness.container.voteManager.cast(facilitator, started.id, noteId, 1);
    await ask(started.id);

    expect((await board(facilitator, started.id)).myVotesLeft).toBe(started.maxVotes - 1);
    await expect(
      retros().updateRetro(facilitator, started.id, {maxVotes: 2}),
    ).rejects.toMatchObject({status: 409});
    await expect(
      harness.container.noteManager.create(facilitator, started.id, columnId, 'late'),
    ).rejects.toMatchObject({status: 403});
    await expect(retros().addColumn(facilitator, started.id, 'Kudos')).rejects.toMatchObject({status: 403});

    await retros().updateRetro(facilitator, started.id, {phase: 'SHARE'});

    expect((await board(facilitator, started.id)).myVotesLeft).toBe(started.maxVotes);
  });

  it('answers 404 on every route to a user of another org', async () => {
    const {id} = await create();
    const stranger = await harness.createUser(await harness.createOrg('Other'), 'Eve', 'admin');

    expect((await request(`/retros/${id}/icebreaker`, {body: json({action: 'draw'}), method: 'PATCH'}, stranger)).status).toBe(404);
    expect((await request(`/retros/${id}/icebreaker/answer`, {body: json({text: 'Hi'}), method: 'PUT'}, stranger)).status).toBe(404);
    expect((await request(`/retros/${id}/icebreaker/answer`, {method: 'DELETE'}, stranger)).status).toBe(404);
  });
});
