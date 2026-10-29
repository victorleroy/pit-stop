import {Hono} from 'hono';
import {Harness} from '../helpers/harness';
import {errorHandler} from '~/Http/errorHandler';
import type {Variables} from '~/Http/middleware/auth';
import {orgRoutes} from '~/Http/routes/org';
import {teamRoutes} from '~/Http/routes/teams';
import type {AuthContext} from '~/Security/AuthContext';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

/** BEHAVIOUR.md section 5 and 6: what an org admin can do across teams they have not joined. */
describe('organisation administration', () => {
  let harness: Harness;
  let orgId: string;
  let orgAdmin: AuthContext;
  let teamAdmin: AuthContext;
  let member: AuthContext;
  let teamId: string;

  beforeEach(async () => {
    harness = Harness.create();
    orgId = await harness.createOrg();
    orgAdmin = await harness.createUser(orgId, 'Victor', 'admin');
    teamAdmin = await harness.createUser(orgId, 'Alice');
    member = await harness.createUser(orgId, 'Bob');

    // The org admin is deliberately not in the team.
    teamId = await harness.createTeam(teamAdmin, [member]);
  });

  afterEach(async () => harness.destroy());

  const send = (auth: AuthContext, path: string, method = 'GET') => {
    const app = new Hono<{Variables: Variables}>();

    app.onError(errorHandler);
    app.use('*', async (context, next) => {
      context.set('auth', auth);
      await next();
    });
    app.route('/', teamRoutes(harness.container));
    app.route('/', orgRoutes(harness.container));

    return app.request(path, {method});
  };

  const createRetroWithContent = async (notes: number) => {
    const board = await harness.container.retroManager.create(teamAdmin, teamId, 'Sprint 42');

    for (let index = 0; index < notes; index += 1) {
      await harness.container.noteManager.create(
        member,
        board.id,
        board.columns[0]!.id,
        `secret ${index}`,
      );
    }

    // Actions are created while discussing.
    await harness.container.retroManager.updateRetro(teamAdmin, board.id, {phase: 'DISCUSS'});

    return board.id;
  };

  const backdate = async (retroId: string, days: number) => {
    const createdAt = daysAgo(days);

    await harness.container.db
      .updateTable('retros')
      .set({createdAt})
      .where('id', '=', retroId)
      .execute();
    await harness.container.db
      .updateTable('notes')
      .set({createdAt})
      .where('retroId', '=', retroId)
      .execute();
    await harness.container.db
      .updateTable('actions')
      .set({createdAt})
      .where('retroId', '=', retroId)
      .execute();
  };

  const count = async (table: 'actions' | 'memberships' | 'notes' | 'retros') => {
    const row = await harness.container.db
      .selectFrom(table)
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  };

  describe('deleting a team', () => {
    let retroId: string;

    beforeEach(async () => {
      retroId = await createRetroWithContent(2);
      await harness.container.actionManager.create(teamAdmin, retroId, 'follow up');
    });

    it('is allowed to an org admin outside the team, and takes everything with it', async () => {
      const response = await send(orgAdmin, `/teams/${teamId}`, 'DELETE');

      expect(response.status).toBe(204);
      expect(await count('retros')).toBe(0);
      expect(await count('notes')).toBe(0);
      expect(await count('actions')).toBe(0);
      expect(await count('memberships')).toBe(0);

      await expect(
        harness.container.retroManager.getBoard(teamAdmin, retroId),
      ).rejects.toMatchObject({status: 404});
      // The team's action list is gated on membership, which went with the team.
      await expect(
        harness.container.actionManager.listByTeam(teamAdmin, teamId),
      ).rejects.toMatchObject({status: 403});
      expect((await send(orgAdmin, `/teams/${teamId}/summary`)).status).toBe(404);
      expect(await harness.container.teamManager.listTeams(orgAdmin)).toEqual([]);
    });

    it('is refused to a team admin who is not an org admin', async () => {
      expect((await send(teamAdmin, `/teams/${teamId}`, 'DELETE')).status).toBe(403);
      expect(await count('retros')).toBe(1);
    });

    it('is refused to a plain member', async () => {
      expect((await send(member, `/teams/${teamId}`, 'DELETE')).status).toBe(403);
      expect(await count('retros')).toBe(1);
    });

    it('does not reveal a team of another organisation', async () => {
      const otherOrg = await harness.createOrg('Globex');
      const stranger = await harness.createUser(otherOrg, 'Eve', 'admin');

      expect((await send(stranger, `/teams/${teamId}`, 'DELETE')).status).toBe(404);
      expect((await send(stranger, `/teams/${teamId}/summary`)).status).toBe(404);
      expect(await count('retros')).toBe(1);
    });

    it('tells whoever is still on one of its boards that the retro is gone', async () => {
      const sent: string[] = [];

      harness.container.hub.acquire(retroId).add({
        name: member.name,
        socket: {
          close: jest.fn(),
          OPEN: 1,
          readyState: 1,
          send: (payload: string) => sent.push(payload),
        } as never,
        token: 'token',
        userId: member.userId,
      });

      expect((await send(orgAdmin, `/teams/${teamId}`, 'DELETE')).status).toBe(204);
      expect(sent.map((payload) => JSON.parse(payload))).toContainEqual(
        expect.objectContaining({message: 'This retro was deleted', type: 'error'}),
      );
    });

    it('gives the org admin counters to confirm with, and nothing else', async () => {
      const response = await send(orgAdmin, `/teams/${teamId}/summary`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({actionCount: 1, retroCount: 1});
      expect((await send(teamAdmin, `/teams/${teamId}/summary`)).status).toBe(403);
      expect((await send(member, `/teams/${teamId}/summary`)).status).toBe(403);
    });
  });

  describe('organisation stats', () => {
    beforeEach(async () => {
      // Recent: 3 notes and an open action, today.
      const recent = await createRetroWithContent(3);
      await harness.container.actionManager.create(teamAdmin, recent, 'open one');

      // 60 days ago: 1 note, a done action.
      const older = await createRetroWithContent(1);
      const done = await harness.container.actionManager.create(teamAdmin, older, 'done one');
      await harness.container.actionManager.update(teamAdmin, teamId, done.id, {status: 'DONE'});
      await backdate(older, 60);

      // 200 days ago: 2 notes, a dropped action.
      const oldest = await createRetroWithContent(2);
      const dropped = await harness.container.actionManager.create(teamAdmin, oldest, 'gone');
      await harness.container.actionManager.update(teamAdmin, teamId, dropped.id, {
        status: 'DROPPED',
      });
      await backdate(oldest, 200);

      // A second team, 90 days old, whose only retro is 45 days old: idle.
      const idleTeam = await harness.createTeam(teamAdmin);
      const idleRetro = await harness.container.retroManager.create(teamAdmin, idleTeam, 'Old');
      await backdate(idleRetro.id, 45);
      await backdateTeam(idleTeam, 90);
    });

    const backdateTeam = async (id: string, days: number) => {
      await harness.container.db
        .updateTable('teams')
        .set({createdAt: daysAgo(days)})
        .where('id', '=', id)
        .execute();
    };

    const stats = async (period: string) => {
      const response = await send(orgAdmin, `/org/stats?period=${period}`);

      expect(response.status).toBe(200);

      return response.json();
    };

    it('counts the last 30 days', async () => {
      expect(await stats('30d')).toEqual({
        actions: {done: 0, dropped: 0, open: 1},
        notes: {count: 3, perRetro: 3},
        people: {admins: 1, total: 3},
        period: '30d',
        retros: {count: 1, total: 4},
        teams: {idle: 1, total: 2},
      });
    });

    it('counts a rolling 90 days', async () => {
      expect(await stats('90d')).toEqual({
        actions: {done: 1, dropped: 0, open: 1},
        notes: {count: 4, perRetro: 2},
        people: {admins: 1, total: 3},
        period: '90d',
        retros: {count: 3, total: 4},
        teams: {idle: 1, total: 2},
      });
    });

    it('counts all time', async () => {
      expect(await stats('all')).toEqual({
        actions: {done: 1, dropped: 1, open: 1},
        notes: {count: 6, perRetro: 2},
        people: {admins: 1, total: 3},
        period: 'all',
        retros: {count: 4, total: 4},
        teams: {idle: 1, total: 2},
      });
    });

    it('counts a team as idle only once it is old enough to be', async () => {
      // Created today without a retro: not idle yet. 45 days old without a retro: idle.
      await harness.createTeam(teamAdmin);
      const emptyTeam = await harness.createTeam(teamAdmin);
      await backdateTeam(emptyTeam, 45);

      expect(await stats('30d')).toMatchObject({teams: {idle: 2, total: 4}});
    });

    it('carries no text, title or author', async () => {
      const body = JSON.stringify(await stats('all'));

      expect(body).not.toMatch(/secret|Sprint|open one|done one|gone|Alice|Bob|Victor/);
      expect(body).not.toMatch(/"(text|title|name|author|authorId|userId|email)"/);
    });

    it('ignores other organisations', async () => {
      const otherOrg = await harness.createOrg('Globex');
      const stranger = await harness.createUser(otherOrg, 'Eve', 'admin');
      const response = await send(stranger, '/org/stats?period=all');

      expect(await response.json()).toMatchObject({
        notes: {count: 0, perRetro: 0},
        people: {admins: 1, total: 1},
        retros: {count: 0, total: 0},
        teams: {idle: 0, total: 0},
      });
    });

    it('is refused to anybody but an org admin', async () => {
      expect((await send(member, '/org/stats?period=30d')).status).toBe(403);
      expect((await send(teamAdmin, '/org/stats?period=30d')).status).toBe(403);
    });

    it('refuses an unknown period', async () => {
      expect((await send(orgAdmin, '/org/stats?period=7d')).status).toBe(400);
      expect((await send(orgAdmin, '/org/stats')).status).toBe(400);
    });
  });
});
