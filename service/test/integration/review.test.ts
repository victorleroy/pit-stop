import {Hono} from 'hono';
import {Harness} from '../helpers/harness';
import {errorHandler} from '~/Http/errorHandler';
import type {Variables} from '~/Http/middleware/auth';
import {retroRoutes} from '~/Http/routes/retros';
import {teamRoutes} from '~/Http/routes/teams';
import {ReviewManager} from '~/Manager/ReviewManager';
import {ActionRepository} from '~/Repository/ActionRepository';
import {ActionReviewRepository} from '~/Repository/ActionReviewRepository';
import {BoardRepository} from '~/Repository/BoardRepository';
import {MembershipRepository} from '~/Repository/MembershipRepository';
import {RetroRepository} from '~/Repository/RetroRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {RetroAccessChecker} from '~/Security/RetroAccessChecker';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/** BEHAVIOUR.md section 6, Review: Done, Drop or Keep on the actions a retro carries over. */
describe('action review', () => {
  let harness: Harness;
  let owner: AuthContext;
  let member: AuthContext;
  let teamId: string;
  let previousRetroId: string;
  let retroId: string;
  let actionId: string;

  beforeEach(async () => {
    harness = Harness.create();

    const orgId = await harness.createOrg('Acme');

    owner = await harness.createUser(orgId, 'Victor', 'admin');
    member = await harness.createUser(orgId, 'Alice');
    teamId = await harness.createTeam(owner, [member]);
    previousRetroId = (await harness.container.retroManager.create(owner, teamId, 'Sprint 41')).id;
    await harness.container.retroManager.updateRetro(owner, previousRetroId, {
      phase: 'DISCUSS',
    });
    actionId = (await harness.container.actionManager.create(owner, previousRetroId, 'Fix the CI'))
      .id;
    await tick();
    retroId = (await harness.container.retroManager.create(owner, teamId, 'Sprint 42')).id;
  });

  afterEach(async () => harness.destroy());

  const review = (_harness: Harness) => _harness.container.reviewManager;
  const record = (outcome: 'DONE' | 'DROPPED' | 'KEPT', comment?: string | null, auth = member) =>
    review(harness).recordOutcome(auth, retroId, actionId, outcome, comment);
  const action = async () =>
    (await new ActionRepository(harness.container.db).findOneById(owner.db, actionId))!;
  const reviewRows = () => harness.container.db.selectFrom('actionReviews').selectAll().execute();
  const itemsFor = async (auth: AuthContext) =>
    (await harness.container.retroManager.getBoard(auth, retroId)).review;

  const request = (path: string, init: RequestInit, auth = member) => {
    const app = new Hono<{Variables: Variables}>();

    app.use('*', async (context, next) => {
      context.set('auth', auth);
      await next();
    });
    app.route('/', retroRoutes(harness.container));
    app.route('/', teamRoutes(harness.container));
    app.onError(errorHandler);

    return app.request(path, {
      headers: {'content-type': 'application/json'},
      ...init,
    });
  };

  it('closes the action on Done, with the closing date of the review and its reviewer', async () => {
    const item = await record('DONE', 'Shipped');
    const closed = await action();

    expect(closed.status).toBe('DONE');
    expect(closed.closedAt).toBe(item.reviewedAt);
    expect(item).toMatchObject({
      comment: 'Shipped',
      outcome: 'DONE',
      reviewedBy: {id: member.userId, name: 'Alice'},
    });
    expect(await reviewRows()).toHaveLength(1);
  });

  it('keeps the action open on Keep', async () => {
    await record('KEPT');

    expect(await action()).toMatchObject({closedAt: null, status: 'OPEN'});
  });

  it('replaces the outcome and reopens the action when Done becomes Keep', async () => {
    await record('DONE');
    await record('KEPT');

    expect(await action()).toMatchObject({closedAt: null, status: 'OPEN'});
    expect((await reviewRows()).map(({outcome}) => outcome)).toEqual(['KEPT']);
  });

  it('only corrects the comment when the same outcome comes again', async () => {
    const first = await record('DONE', 'Shipped');

    await tick();

    const second = await record('DONE', 'Shipped on Monday', owner);

    expect(second).toMatchObject({
      comment: 'Shipped on Monday',
      reviewedAt: first.reviewedAt,
      reviewedBy: {id: member.userId},
    });
    expect((await action()).closedAt).toBe(first.reviewedAt);
  });

  it('stores a blank comment as none', async () => {
    const item = await record('DONE', '   ');

    expect(item.comment).toBeUndefined();
    expect((await reviewRows())[0]!.comment).toBeNull();
  });

  it('keeps a reviewed action in the review, whatever its status now', async () => {
    await record('DONE');

    const {items} = await itemsFor(owner);

    expect(items).toEqual([
      expect.objectContaining({
        action: expect.objectContaining({id: actionId, status: 'DONE'}),
        outcome: 'DONE',
      }),
    ]);
  });

  it('reopens the action when its Done is undone', async () => {
    await record('DONE');
    await review(harness).clearOutcome(member, retroId, actionId);

    expect(await action()).toMatchObject({closedAt: null, status: 'OPEN'});
    expect(await reviewRows()).toHaveLength(0);
  });

  it('leaves the status alone when undoing a Done the action no longer carries', async () => {
    await record('DONE');
    await tick();
    await harness.container.actionManager.update(owner, teamId, actionId, {
      status: 'OPEN',
    });
    await harness.container.actionManager.update(owner, teamId, actionId, {
      status: 'DONE',
    });
    await review(harness).clearOutcome(member, retroId, actionId);

    expect((await action()).status).toBe('DONE');
  });

  it('leaves the status alone when undoing a Keep on an action closed elsewhere', async () => {
    await record('KEPT');
    await harness.container.actionManager.update(owner, teamId, actionId, {
      status: 'DONE',
    });
    await review(harness).clearOutcome(member, retroId, actionId);

    expect((await action()).status).toBe('DONE');
    expect(await reviewRows()).toHaveLength(0);
  });

  it('does not touch an action already closed with the same status', async () => {
    await record('KEPT');
    await harness.container.actionManager.update(owner, teamId, actionId, {
      status: 'DONE',
    });

    const closedAt = (await action()).closedAt;

    await record('DONE');

    expect((await action()).closedAt).toBe(closedAt);
  });

  it('records an outcome in every phase but ARCHIVED', async () => {
    for (const phase of ['SHARE', 'VOTE', 'DISCUSS'] as const) {
      await harness.container.retroManager.updateRetro(owner, retroId, {
        phase,
      });
      await expect(record('KEPT')).resolves.toMatchObject({outcome: 'KEPT'});
    }

    await harness.container.retroManager.updateRetro(owner, retroId, {
      phase: 'ARCHIVED',
    });
    await expect(record('DONE')).rejects.toMatchObject({status: 409});
    await expect(review(harness).clearOutcome(member, retroId, actionId)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuses an action decided in this retro, and one of another team', async () => {
    await harness.container.retroManager.updateRetro(owner, retroId, {
      phase: 'DISCUSS',
    });

    const own = await harness.container.actionManager.create(owner, retroId, 'Pair more');

    await expect(
      review(harness).recordOutcome(member, retroId, own.id, 'DONE'),
    ).rejects.toMatchObject({status: 409});

    const otherTeamId = await harness.createTeam(owner);
    const otherRetroId = (await harness.container.retroManager.create(owner, otherTeamId, 'X')).id;

    await harness.container.retroManager.updateRetro(owner, otherRetroId, {
      phase: 'DISCUSS',
    });

    const foreign = await harness.container.actionManager.create(owner, otherRetroId, 'Elsewhere');

    await expect(
      review(harness).recordOutcome(member, retroId, foreign.id, 'DONE'),
    ).rejects.toMatchObject({status: 404});
  });

  it('refuses an action closed elsewhere and never reviewed here', async () => {
    await harness.container.actionManager.update(owner, teamId, actionId, {
      status: 'DROPPED',
    });

    await expect(record('DONE')).rejects.toMatchObject({status: 409});
  });

  it('gives the same review block to every reader, in every phase', async () => {
    await record('DONE', 'Shipped');

    for (const phase of ['BRAINSTORM', 'SHARE', 'VOTE', 'DISCUSS', 'ARCHIVED'] as const) {
      await harness.container.retroManager.updateRetro(owner, retroId, {
        phase,
      });

      expect(await itemsFor(owner)).toEqual(await itemsFor(member));
      expect((await itemsFor(owner)).items).toHaveLength(1);
    }
  });

  it('rolls the action back when the outcome cannot be stored', async () => {
    class FailingRepository extends ActionReviewRepository {
      public override async upsert(): Promise<void> {
        throw new Error('disk full');
      }
    }

    const db = harness.container.db;
    const retroRepository = new RetroRepository(db);
    const manager = new ReviewManager(
      new ActionRepository(db),
      new FailingRepository(db),
      new BoardRepository(db),
      retroRepository,
      new RetroAccessChecker(retroRepository, new MembershipRepository(db)),
    );

    await expect(manager.recordOutcome(member, retroId, actionId, 'DONE')).rejects.toThrow(
      'disk full',
    );
    expect(await action()).toMatchObject({closedAt: null, status: 'OPEN'});
  });

  describe('over HTTP', () => {
    it('validates the outcome and caps the comment at 300 characters', async () => {
      const path = `/retros/${retroId}/review/actions/${actionId}`;

      expect(
        (
          await request(path, {
            body: JSON.stringify({outcome: 'MAYBE'}),
            method: 'PUT',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(path, {
            body: JSON.stringify({comment: 'x'.repeat(301), outcome: 'DONE'}),
            method: 'PUT',
          })
        ).status,
      ).toBe(400);

      const response = await request(path, {
        body: JSON.stringify({comment: null, outcome: 'DONE'}),
        method: 'PUT',
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({outcome: 'DONE'});
      expect((await request(path, {method: 'DELETE'})).status).toBe(204);
      expect((await action()).status).toBe('OPEN');
    });

    it('re-broadcasts the other live retros of the team', async () => {
      const otherRetroId = (
        await harness.container.retroManager.create(owner, teamId, 'Sprint 42 bis')
      ).id;
      const refresh = jest.spyOn(harness.container.hub, 'refreshRetros');

      harness.container.hub.acquire(otherRetroId);

      const response = await request(`/retros/${retroId}/review/actions/${actionId}`, {
        body: JSON.stringify({outcome: 'DONE'}),
        method: 'PUT',
      });

      expect(response.status).toBe(200);
      expect(refresh).toHaveBeenCalledWith([otherRetroId]);
    });

    it('refuses the review to an org admin who is not in the team', async () => {
      const outsider = await harness.createUser(owner.orgId, 'Bob', 'admin');
      const response = await request(
        `/retros/${retroId}/review/actions/${actionId}`,
        {body: JSON.stringify({outcome: 'DONE'}), method: 'PUT'},
        outsider,
      );

      expect(response.status).toBe(403);
      expect((await request(`/teams/${teamId}/actions/stats`, {}, outsider)).status).toBe(403);
    });

    it('hides the review of another organisation', async () => {
      const otherOrgId = await harness.createOrg('Globex');
      const stranger = await harness.createUser(otherOrgId, 'Eve', 'admin');
      const response = await request(
        `/retros/${retroId}/review/actions/${actionId}`,
        {body: JSON.stringify({outcome: 'DONE'}), method: 'PUT'},
        stranger,
      );

      expect(response.status).toBe(404);
    });
  });
});
