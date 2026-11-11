import {Hono} from 'hono';
import {Harness} from '../helpers/harness';
import {errorHandler} from '~/Http/errorHandler';
import type {Variables} from '~/Http/middleware/auth';
import {teamRoutes} from '~/Http/routes/teams';
import type {AuthContext} from '~/Security/AuthContext';

/** An action edit changes every live board of the team that shows it (BEHAVIOUR.md section 8). */
describe('action broadcasts', () => {
  let harness: Harness;
  let owner: AuthContext;
  let teamId: string;
  let previousRetroId: string;
  let actionId: string;

  beforeEach(async () => {
    harness = Harness.create();

    const orgId = await harness.createOrg('Acme');

    owner = await harness.createUser(orgId, 'Victor', 'admin');
    teamId = await harness.createTeam(owner);
    previousRetroId = (await harness.container.retroManager.create(owner, teamId, 'Sprint 41')).id;
    await harness.container.retroManager.updateRetro(owner, previousRetroId, {phase: 'DISCUSS'});
    actionId = (await harness.container.actionManager.create(owner, previousRetroId, 'Fix the CI'))
      .id;
    // Carry-over compares creation times: the next retro has to be strictly later.
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

  afterEach(async () => harness.destroy());

  const createRetro = async (auth: AuthContext, team: string, title: string) =>
    (await harness.container.retroManager.create(auth, team, title)).id;

  const sessionToken = async (auth: AuthContext): Promise<string> => {
    const row = (await harness.container.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', auth.userId)
      .executeTakeFirst())!;

    return (await harness.container.authManager.issueSession(row)).token;
  };

  /** A live board, as a connected participant sees it. */
  const watch = async (auth: AuthContext, retroId: string) => {
    const sent: string[] = [];
    const socket = {
      close: jest.fn(),
      OPEN: 1,
      readyState: 1,
      send: (raw: string) => sent.push(raw),
    };

    harness.container.hub
      .acquire(retroId)
      .add({
        name: 'Victor',
        socket: socket as never,
        token: await sessionToken(auth),
        userId: auth.userId,
      });

    return () =>
      sent
        .map((raw) => JSON.parse(raw))
        .filter((event) => event.type === 'board.updated')
        .map((event) => event.board);
  };

  const patch = async (body: object) => {
    const app = new Hono<{Variables: Variables}>();

    app.use('*', async (context, next) => {
      context.set('auth', owner);
      await next();
    });
    app.route('/', teamRoutes(harness.container));
    app.onError(errorHandler);

    return app.request(`/teams/${teamId}/actions/${actionId}`, {
      body: JSON.stringify(body),
      headers: {'content-type': 'application/json'},
      method: 'PATCH',
    });
  };

  it('re-broadcasts the live retro that carries the action over', async () => {
    const currentRetroId = await createRetro(owner, teamId, 'Sprint 42');
    const boards = await watch(owner, currentRetroId);

    const before = await harness.container.retroManager.getBoard(owner, currentRetroId);

    expect(before.carriedOverActions).toEqual([expect.objectContaining({id: actionId})]);
    expect((await patch({status: 'DONE'})).status).toBe(200);

    const last = boards().at(-1);

    expect(last.id).toBe(currentRetroId);
    expect(last.carriedOverActions).toEqual([]);
  });

  it('re-broadcasts the live retros of the team when the original retro is deleted', async () => {
    const currentRetroId = await createRetro(owner, teamId, 'Sprint 42');

    await harness.container.retroManager.remove(owner, previousRetroId);

    const boards = await watch(owner, currentRetroId);

    expect((await patch({text: 'Fix the CI for good'})).status).toBe(200);
    expect(boards().at(-1).carriedOverActions).toEqual([
      expect.objectContaining({id: actionId, text: 'Fix the CI for good'}),
    ]);
  });

  it('re-broadcasts every live retro of the team, and no retro of another team', async () => {
    const first = await watch(owner, await createRetro(owner, teamId, 'Sprint 42'));
    const second = await watch(owner, await createRetro(owner, teamId, 'Sprint 42 bis'));
    const otherTeamId = await harness.createTeam(owner);
    const elsewhere = await watch(owner, await createRetro(owner, otherTeamId, 'Elsewhere'));

    expect((await patch({status: 'DROPPED'})).status).toBe(200);

    expect(first()).toHaveLength(1);
    expect(second()).toHaveLength(1);
    expect(elsewhere()).toHaveLength(0);
  });

  it('records when an action was closed, clears it on reopen, and keeps it on the same status', async () => {
    const closedAt = async () =>
      (
        await harness.container.db
          .selectFrom('actions')
          .select('closedAt')
          .where('id', '=', actionId)
          .executeTakeFirstOrThrow()
      ).closedAt;
    const update = (status: 'OPEN' | 'DONE' | 'DROPPED') =>
      harness.container.actionManager.update(owner, teamId, actionId, {status});

    expect(await closedAt()).toBeNull();

    const done = await update('DONE');

    expect(done.closedAt).toEqual(expect.any(String));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await update('DONE');
    expect(await closedAt()).toBe(done.closedAt);

    await update('DROPPED');
    expect(await closedAt()).not.toBe(done.closedAt);

    await update('OPEN');
    expect(await closedAt()).toBeNull();
  });
});
