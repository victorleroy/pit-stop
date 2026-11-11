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
    previousRetroId = (await harness.createStartedRetro(owner, teamId, 'Sprint 41')).id;
    await harness.container.retroManager.updateRetro(owner, previousRetroId, {
      phase: 'DISCUSS',
    });
    actionId = (await harness.container.actionManager.create(owner, previousRetroId, 'Fix the CI'))
      .id;
    await tick();
    retroId = (await harness.createStartedRetro(owner, teamId, 'Sprint 42')).id;
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

  it('keeps the comment when the outcome changes without one', async () => {
    await record('DONE', 'Shipped');
    await record('KEPT');

    expect((await reviewRows())[0]).toMatchObject({comment: 'Shipped', outcome: 'KEPT'});
    await record('DROPPED', null);
    expect((await reviewRows())[0]!.comment).toBeNull();
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
    for (const phase of ['REVIEW', 'SHARE', 'VOTE', 'DISCUSS'] as const) {
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
    const otherRetroId = (await harness.createStartedRetro(owner, otherTeamId, 'X')).id;

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

    for (const phase of ['REVIEW', 'BRAINSTORM', 'SHARE', 'VOTE', 'DISCUSS', 'ARCHIVED', 'REVIEW'] as const) {
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

  /** BEHAVIOUR.md section 3, REVIEW: the facilitator walks the team through its open actions. */
  describe('REVIEW phase', () => {
    let secondActionId: string;

    const enter = (phase: 'REVIEW' | 'BRAINSTORM' | 'SHARE' | 'DISCUSS' | 'ARCHIVED') =>
      harness.container.retroManager.updateRetro(owner, retroId, {phase});
    const focus = (id: string | null, auth = owner) => review(harness).setFocus(auth, retroId, id);

    beforeEach(async () => {
      secondActionId = (
        await harness.container.actionManager.create(owner, previousRetroId, 'Write the runbook')
      ).id;
      await tick();
      // Reviewed by a retro opened after both actions were decided.
      retroId = (await harness.createStartedRetro(owner, teamId, 'Sprint 43')).id;
    });

    it('focuses the first undecided action on entering, and drops the focus on leaving', async () => {
      await record('DONE');
      await expect(enter('REVIEW')).resolves.toMatchObject({
        review: {focusActionId: secondActionId},
      });
      await expect(enter('BRAINSTORM')).resolves.toMatchObject({review: {focusActionId: null}});
    });

    it('focuses nothing when every action is decided', async () => {
      await record('KEPT');
      await review(harness).recordOutcome(member, retroId, secondActionId, 'DROPPED');

      await expect(enter('REVIEW')).resolves.toMatchObject({review: {focusActionId: null}});
    });

    it('keeps the focus where it is when the action under it is decided', async () => {
      await enter('REVIEW');
      await record('DONE');

      expect((await itemsFor(member)).focusActionId).toBe(actionId);
    });

    it('lets the facilitator alone move the focus, for everyone', async () => {
      await enter('REVIEW');
      await focus(secondActionId);

      expect((await itemsFor(member)).focusActionId).toBe(secondActionId);
      await focus(null);
      expect((await itemsFor(member)).focusActionId).toBeNull();
      await expect(focus(actionId, member)).rejects.toMatchObject({status: 403});
    });

    it('refuses to move the focus outside REVIEW, with a conflict once archived', async () => {
      await expect(focus(actionId)).rejects.toMatchObject({status: 403});
      await enter('ARCHIVED');
      await expect(focus(actionId)).rejects.toMatchObject({status: 409});
    });

    it('refuses to focus an action this retro does not review', async () => {
      await enter('DISCUSS');

      const ownActionId = (await harness.container.actionManager.create(owner, retroId, 'New one')).id;

      await enter('REVIEW');
      await expect(focus(ownActionId)).rejects.toMatchObject({status: 409});
    });

    it('comes back to REVIEW from any phase, ARCHIVED included, with its outcomes', async () => {
      await enter('REVIEW');
      await record('DONE', 'Shipped');
      await enter('ARCHIVED');
      await expect(enter('REVIEW')).resolves.toMatchObject({
        phase: 'REVIEW',
        review: {focusActionId: secondActionId},
      });
      expect((await itemsFor(member)).items[0]).toMatchObject({comment: 'Shipped', outcome: 'DONE'});
    });

    it('enters REVIEW and the brainstorm without a column, nothing further', async () => {
      const blank = await harness.container.retroManager.create(owner, teamId, 'Blank', {columns: []});
      const move = (phase: 'REVIEW' | 'BRAINSTORM' | 'SHARE') =>
        harness.container.retroManager.updateRetro(owner, blank.id, {phase});

      await expect(move('REVIEW')).resolves.toMatchObject({phase: 'REVIEW'});
      await expect(move('SHARE')).rejects.toMatchObject({status: 409});
      await expect(move('BRAINSTORM')).resolves.toMatchObject({phase: 'BRAINSTORM'});
    });

    it('keeps the votes on a detour through REVIEW, and wipes them on arriving in SHARE', async () => {
      const board = await harness.container.retroManager.getBoard(owner, retroId);

      await harness.container.noteManager.create(owner, retroId, board.columns[0]!.id, 'Flaky CI');
      await enter('SHARE');
      await harness.container.retroManager.updateRetro(owner, retroId, {phase: 'VOTE'});

      const voting = await harness.container.retroManager.getBoard(owner, retroId);

      await harness.container.voteManager.cast(owner, retroId, voting.columns[0]!.cards[0]!.id, 1);
      await enter('DISCUSS');
      await expect(enter('REVIEW')).resolves.toMatchObject({myVotesLeft: 4});
      await expect(
        harness.container.retroManager.updateRetro(owner, retroId, {maxVotes: 3}),
      ).rejects.toMatchObject({message: 'Votes per person can only change before voting starts'});
      await expect(enter('SHARE')).resolves.toMatchObject({myVotesLeft: 5});
    });

    it('reviews by default, and can be turned off in the waiting room only', async () => {
      const lobby = await harness.container.retroManager.create(owner, teamId, 'Sprint 43');

      expect(lobby.review.enabled).toBe(true);
      await expect(
        harness.container.retroManager.updateRetro(owner, lobby.id, {actionReview: false}),
      ).resolves.toMatchObject({review: {enabled: false}});
      await expect(
        harness.container.retroManager.updateRetro(member, lobby.id, {actionReview: true}),
      ).rejects.toMatchObject({status: 403});
      await expect(
        harness.container.retroManager.updateRetro(owner, retroId, {actionReview: false}),
      ).rejects.toMatchObject({
        message: 'The action review can only change before the retro starts',
        status: 409,
      });
    });

    it('creates a retro without review when asked', async () => {
      const board = await harness.container.retroManager.create(owner, teamId, 'Sprint 43', {
        actionReview: false,
      });

      expect(board.review).toMatchObject({enabled: false, focusActionId: null});
    });
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
        await harness.createStartedRetro(owner, teamId, 'Sprint 42 bis')
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

    it('moves the focus and validates it', async () => {
      await harness.container.retroManager.updateRetro(owner, retroId, {phase: 'REVIEW'});

      const path = `/retros/${retroId}/review/focus`;
      const put = (body: unknown, auth = owner) =>
        request(path, {body: JSON.stringify(body), method: 'PUT'}, auth);

      expect((await put({actionId: actionId})).status).toBe(204);
      expect((await put({actionId: null})).status).toBe(204);
      expect((await put({actionId: ''})).status).toBe(400);
      expect((await put({})).status).toBe(400);
      expect((await put({actionId}, member)).status).toBe(403);
    });

    it('turns the review off at creation and in the waiting room', async () => {
      const created = await request(`/teams/${teamId}/retros`, {
        body: JSON.stringify({actionReview: false, title: 'Sprint 43'}),
        method: 'POST',
      }, owner);
      const board = (await created.json()) as {id: string; review: {enabled: boolean}};

      expect(board.review.enabled).toBe(false);

      const patched = await request(`/retros/${board.id}`, {
        body: JSON.stringify({actionReview: true}),
        method: 'PATCH',
      }, owner);

      expect(await patched.json()).toMatchObject({review: {enabled: true}});
      expect(
        (
          await request(`/retros/${board.id}`, {
            body: JSON.stringify({actionReview: 'yes'}),
            method: 'PATCH',
          }, owner)
        ).status,
      ).toBe(400);
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
