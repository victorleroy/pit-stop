import {Harness} from '../helpers/harness';
import type {AuthContext} from '~/Security/AuthContext';

/**
 * ADR-001 D6 and D12. Isolation between customer organisations is the property that must never
 * regress once there is more than one of them, so it is tested from the outside: what can a
 * member of Acme reach of Globex, by id, when they already know the id.
 */
describe('multi-tenant isolation', () => {
  let harness: Harness;
  let acme: AuthContext;
  let globex: AuthContext;
  let acmeTeamId: string;
  let acmeRetroId: string;

  beforeEach(async () => {
    harness = Harness.create();

    const acmeOrg = await harness.createOrg('Acme');
    const globexOrg = await harness.createOrg('Globex');

    acme = await harness.createUser(acmeOrg, 'Victor', 'admin');
    globex = await harness.createUser(globexOrg, 'Mallory', 'admin');

    acmeTeamId = await harness.createTeam(acme);

    const board = await harness.container.retroManager.create(acme, acmeTeamId, 'Acme internals');

    acmeRetroId = board.id;

    await harness.container.noteManager.create(acme, acmeRetroId, board.columns[0]!.id, 'acme secret');
  });

  afterEach(async () => harness.destroy());

  it('hides the existence of another organisation retro behind a 404, never a 403', async () => {
    await expect(
      harness.container.retroManager.getBoard(globex, acmeRetroId),
    ).rejects.toMatchObject({status: 404});
  });

  it('refuses to list the retros of another organisation team', async () => {
    await expect(harness.container.retroManager.listByTeam(globex, acmeTeamId)).rejects.toThrow();
  });

  it('keeps another organisation team out of the team list', async () => {
    const teams = await harness.container.teamManager.listTeams(globex);

    expect(teams).toHaveLength(0);
  });

  it('refuses to add anybody to a team of another organisation', async () => {
    await expect(
      harness.container.teamManager.addMember(globex, acmeTeamId, globex.userId),
    ).rejects.toThrow('not found');
  });

  it('never returns a note of another organisation, not even empty', async () => {
    await expect(
      harness.container.retroManager.getBoard(globex, acmeRetroId),
    ).rejects.toThrow();

    const ownBoards = await harness.container.retroManager.listMine(globex);

    expect(ownBoards).toHaveLength(0);
  });

  it('refuses to promote a member of another organisation', async () => {
    await expect(
      harness.container.adminManager.setOrgAdmin(globex, acme.userId, true),
    ).rejects.toThrow('not found in this organisation');
  });

  it('refuses to change the team administrators of another organisation', async () => {
    await expect(
      harness.container.teamManager.setMemberAdmin(globex, acmeTeamId, acme.userId, false),
    ).rejects.toMatchObject({status: 404});
  });

  it('refuses to edit an action of another team through a team you belong to', async () => {
    const acmeOrg = acme.orgId;
    const outsider = await harness.createUser(acmeOrg, 'Eve');
    const otherTeamId = await harness.createTeam(outsider);
    await harness.container.db
      .updateTable('retros')
      .set({phase: 'DISCUSS'})
      .where('id', '=', acmeRetroId)
      .execute();

    const action = await harness.container.actionManager.create(acme, acmeRetroId, 'Ship it');

    await expect(
      harness.container.actionManager.update(outsider, otherTeamId, action.id, {text: 'Sabotage'}),
    ).rejects.toMatchObject({status: 404});
  });

  it('lists only its own members', async () => {
    const members = await harness.container.adminManager.listOrgMembers(globex);

    expect(members.map((member) => member.name)).toEqual(['Mallory']);
  });

  it('refuses the paddock to somebody who is not the platform admin', async () => {
    await expect(harness.container.platformManager.listOrganizations(acme)).rejects.toThrow(
      'Reserved to the platform administrator',
    );
  });

  it('lets the platform admin see counters, and nothing else', async () => {
    const platform: AuthContext = {...acme, isPlatformAdmin: true};
    const orgs = await harness.container.platformManager.listOrganizations(platform);

    expect(orgs.map((org) => org.name).sort()).toEqual(['Acme', 'Globex']);

    const summary = orgs.find((org) => org.name === 'Acme')!;

    expect(summary.retroCount).toBe(1);
    expect(summary.memberCount).toBe(1);
    expect(summary.teamCount).toBe(1);
    // The paddock payload must never carry board content (ADR-001 D8).
    expect(JSON.stringify(orgs)).not.toContain('acme secret');
  });
});
