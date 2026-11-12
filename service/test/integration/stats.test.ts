import {Harness} from '../helpers/harness';
import type {AuthContext} from '~/Security/AuthContext';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/** BEHAVIOUR.md section 6, Review: what a team did with the actions it decided. */
describe('action stats', () => {
  let harness: Harness;
  let owner: AuthContext;
  let teamId: string;

  beforeEach(async () => {
    harness = Harness.create();

    const orgId = await harness.createOrg('Acme');

    owner = await harness.createUser(orgId, 'Victor', 'admin');
    teamId = await harness.createTeam(owner);
  });

  afterEach(async () => harness.destroy());

  const retro = async (title: string) => {
    await tick();

    return (await harness.createStartedRetro(owner, teamId, title)).id;
  };
  const decide = async (retroId: string, ...texts: string[]) => {
    await harness.container.retroManager.updateRetro(owner, retroId, {phase: 'DISCUSS'});

    const ids: string[] = [];

    for (const text of texts) {
      ids.push((await harness.container.actionManager.create(owner, retroId, text)).id);
    }

    return ids;
  };
  const stats = (retroId?: string) =>
    harness.container.reviewManager.getStats(owner, teamId, retroId);
  const record = (retroId: string, actionId: string, outcome: 'DONE' | 'DROPPED' | 'KEPT') =>
    harness.container.reviewManager.recordOutcome(owner, retroId, actionId, outcome);

  it('counts the closings since the previous retro, outside a review too, and none before it', async () => {
    const first = await retro('Sprint 40');
    const [early, late, unrecorded] = await decide(first, 'Early', 'Late', 'Unrecorded');

    await harness.container.actionManager.update(owner, teamId, early!, {status: 'DONE'});

    const second = await retro('Sprint 41');

    await harness.container.actionManager.update(owner, teamId, late!, {status: 'DONE'});
    // Closed before closing dates were recorded: never counted.
    await harness.container.db
      .updateTable('actions')
      .set({status: 'DROPPED'})
      .where('id', '=', unrecorded!)
      .execute();

    const current = await retro('Sprint 42');

    expect(await stats(current)).toMatchObject({
      doneSinceLastRetro: 1,
      droppedSinceLastRetro: 0,
      openCount: 0,
    });
    // From the team page, "since the last retro" counts from the latest retro itself.
    expect(await stats()).toMatchObject({doneSinceLastRetro: 0, openCount: 0});
    expect((await stats(second)).doneSinceLastRetro).toBe(2);
  });

  it('counts every recorded closing when there is no previous retro', async () => {
    const only = await retro('Sprint 1');
    const [actionId] = await decide(only, 'Fix the CI');

    await harness.container.actionManager.update(owner, teamId, actionId!, {status: 'DROPPED'});

    expect(await stats(only)).toMatchObject({
      completionTrend: [{current: true, rate: null, retroId: only}],
      doneSinceLastRetro: 0,
      droppedSinceLastRetro: 1,
      openCount: 0,
    });
  });

  it('draws at most six points, oldest first, ignoring the actions left without an outcome', async () => {
    const origin = await retro('Sprint 0');
    const [a, b, c] = await decide(origin, 'A', 'B', 'C');
    const reviewing: string[] = [];

    for (let index = 1; index <= 7; index += 1) {
      const retroId = await retro(`Sprint ${index}`);

      reviewing.push(retroId);
      await record(retroId, a!, 'KEPT');
    }

    const last = reviewing.at(-1)!;

    await record(last, b!, 'DONE');
    await record(last, c!, 'DROPPED');

    const {completionTrend} = await stats();

    expect(completionTrend.map(({retroId}) => retroId)).toEqual(reviewing.slice(1));
    expect(completionTrend.at(-1)).toMatchObject({
      current: false,
      done: 1,
      dropped: 1,
      kept: 1,
      rate: 0.33,
    });
    expect(completionTrend[0]).toMatchObject({done: 0, kept: 1, rate: 0});
  });

  it('adds the retro asked for as the current point, in place of the oldest', async () => {
    const origin = await retro('Sprint 0');
    const [a] = await decide(origin, 'A');

    for (let index = 1; index <= 6; index += 1) {
      await record(await retro(`Sprint ${index}`), a!, 'KEPT');
    }

    const current = await retro('Sprint 7');
    const {completionTrend} = await stats(current);

    expect(completionTrend).toHaveLength(6);
    expect(completionTrend.at(-1)).toMatchObject({current: true, rate: null, retroId: current});
  });

  it('refuses a retro of another team', async () => {
    const otherTeamId = await harness.createTeam(owner);
    const elsewhere = (await harness.createStartedRetro(owner, otherTeamId, 'X')).id;

    await expect(stats(elsewhere)).rejects.toMatchObject({status: 404});
  });
});
