import {Hono} from 'hono';
import {Harness} from '../helpers/harness';
import {errorHandler} from '~/Http/errorHandler';
import type {Variables} from '~/Http/middleware/auth';
import {retroRoutes} from '~/Http/routes/retros';
import {teamRoutes} from '~/Http/routes/teams';
import type {AuthContext} from '~/Security/AuthContext';

/** BEHAVIOUR.md section 5 and 6: roles, the three lock-out guards, and facilitation. */
describe('teams and roles', () => {
  let harness: Harness;
  let owner: AuthContext;
  let member: AuthContext;
  let orgId: string;

  beforeEach(async () => {
    harness = Harness.create();
    orgId = await harness.createOrg();
    owner = await harness.createUser(orgId, 'Victor', 'admin');
    member = await harness.createUser(orgId, 'Alice');
  });

  afterEach(async () => harness.destroy());

  it('makes whoever creates a team its administrator', async () => {
    const team = await harness.container.teamManager.createTeam(owner, 'Platform');

    expect(team).toMatchObject({isAdmin: true, isMember: true, memberCount: 1});
  });

  it('is idempotent when the user is already a member', async () => {
    const team = await harness.container.teamManager.createTeam(owner, 'Platform');

    await harness.container.teamManager.addMember(owner, team.id, member.userId);
    await harness.container.teamManager.addMember(owner, team.id, member.userId);

    const members = await harness.container.teamManager.listMembers(owner, team.id);

    expect(members).toHaveLength(2);
  });

  it('keeps an added member an ordinary member', async () => {
    const team = await harness.container.teamManager.createTeam(owner, 'Platform');

    await harness.container.teamManager.addMember(owner, team.id, member.userId);

    const teams = await harness.container.teamManager.listTeams(member);

    expect(teams).toMatchObject([{isAdmin: false, isMember: true, name: 'Platform'}]);
  });

  describe('teams are private to their members', () => {
    it('shows an ordinary member only the teams they belong to', async () => {
      await harness.container.teamManager.createTeam(owner, 'Zulu');
      const alpha = await harness.container.teamManager.createTeam(owner, 'Alpha');

      await harness.container.teamManager.addMember(owner, alpha.id, member.userId);

      const teams = await harness.container.teamManager.listTeams(member);

      expect(teams.map((team) => team.name)).toEqual(['Alpha']);
    });

    it('shows every team to an organisation administrator, sorted by name', async () => {
      await harness.container.teamManager.createTeam(member, 'Zulu');
      await harness.container.teamManager.createTeam(member, 'Alpha');

      const teams = await harness.container.teamManager.listTeams(owner);

      expect(teams.map((team) => team.name)).toEqual(['Alpha', 'Zulu']);
      expect(teams.map((team) => team.isMember)).toEqual([false, false]);
    });

    it('refuses to list the members of a team the caller is not in', async () => {
      const team = await harness.container.teamManager.createTeam(owner, 'Platform');
      const outsider = await harness.createUser(orgId, 'Bob');

      await expect(
        harness.container.teamManager.listMembers(outsider, team.id),
      ).rejects.toThrow('not a member');
    });

    /** QA 2026-10-21: the refusal named the team id, which the caller never gave. */
    it('refuses a retro of a team the caller is not in without naming the team', async () => {
      const team = await harness.container.teamManager.createTeam(owner, 'Platform');
      const retro = await harness.container.retroManager.create(owner, team.id, 'Sprint 1');
      const outsider = await harness.createUser(orgId, 'Bob');
      const refusal = await harness.container.retroManager
        .getBoard(outsider, retro.id)
        .catch((error: Error) => error.message);

      expect(refusal).toBe('You are not a member of this team');
    });

    it('refuses to let an ordinary member add somebody', async () => {
      const team = await harness.container.teamManager.createTeam(owner, 'Platform');
      const outsider = await harness.createUser(orgId, 'Bob');

      await harness.container.teamManager.addMember(owner, team.id, member.userId);

      await expect(
        harness.container.teamManager.addMember(member, team.id, outsider.userId),
      ).rejects.toThrow('administrator of this team');
    });

    /**
     * The whole point of the boundary: an organisation administrator administers every team
     * but must not be able to walk into one and read its boards.
     */
    it('refuses to let an organisation administrator add themselves', async () => {
      const team = await harness.container.teamManager.createTeam(member, 'Platform');

      await expect(
        harness.container.teamManager.addMember(owner, team.id, owner.userId),
      ).rejects.toThrow('administrator of this team');
    });

    it('refuses somebody outside the organisation', async () => {
      const team = await harness.container.teamManager.createTeam(owner, 'Platform');
      const stranger = await harness.createUser(await harness.createOrg('Globex'), 'Dana');

      await expect(
        harness.container.teamManager.addMember(owner, team.id, stranger.userId),
      ).rejects.toThrow('not a member of this organisation');
    });

    it('hides team rosters from anybody but an organisation administrator', async () => {
      const team = await harness.container.teamManager.createTeam(owner, 'Platform');

      await harness.container.teamManager.addMember(owner, team.id, member.userId);

      const asAdmin = await harness.container.adminManager.listOrgMembers(owner);
      const asMember = await harness.container.adminManager.listOrgMembers(member);

      expect(asAdmin.find((entry) => entry.name === 'Alice')?.teams).toHaveLength(1);
      expect(asMember.map((entry) => entry.teams)).toEqual([[], []]);
    });
  });

  it('lets a team administrator remove somebody', async () => {
    const team = await harness.container.teamManager.createTeam(owner, 'Platform');

    await harness.container.teamManager.addMember(owner, team.id, member.userId);
    await harness.container.teamManager.removeMember(owner, team.id, member.userId);

    expect(await harness.container.teamManager.listTeams(member)).toEqual([]);
  });

  it('refuses to strand a team without any administrator', async () => {
    const team = await harness.container.teamManager.createTeam(owner, 'Platform');

    await harness.container.teamManager.addMember(owner, team.id, member.userId);

    await expect(harness.container.teamManager.leaveTeam(owner, team.id)).rejects.toThrow(
      'the team would have none',
    );
  });

  it('lets the last administrator leave an otherwise empty team', async () => {
    const team = await harness.container.teamManager.createTeam(owner, 'Platform');

    await expect(harness.container.teamManager.leaveTeam(owner, team.id)).resolves.toBeUndefined();
  });

  it('lets an administrator leave when another one remains', async () => {
    const team = await harness.container.teamManager.createTeam(owner, 'Platform');

    await harness.container.teamManager.addMember(owner, team.id, member.userId);
    await harness.container.teamManager.setMemberAdmin(owner, team.id, member.userId, true);

    await expect(harness.container.teamManager.leaveTeam(owner, team.id)).resolves.toBeUndefined();
  });

  it('refuses to demote the last organisation administrator', async () => {
    await expect(
      harness.container.adminManager.setOrgAdmin(owner, owner.userId, false),
    ).rejects.toThrow('at least one administrator');
  });

  it('demotes when another administrator remains', async () => {
    await harness.container.adminManager.setOrgAdmin(owner, member.userId, true);

    await expect(
      harness.container.adminManager.setOrgAdmin(owner, owner.userId, false),
    ).resolves.toBeUndefined();
  });

  it('gives an organisation administrator team-admin powers everywhere', async () => {
    const team = await harness.container.teamManager.createTeam(member, 'Platform');
    const admin = await harness.container.teamManager.listTeams(owner);

    expect(admin.find((entry) => entry.id === team.id)?.isAdmin).toBe(true);
  });

  /**
   * Regression: the role check passed for an organisation administrator on every team, so the
   * retro was written before the board read refused to hand it back. It left a retro nobody
   * had asked for behind an error message.
   */
  it('writes nothing when an organisation administrator is not in the team', async () => {
    const team = await harness.container.teamManager.createTeam(member, 'Platform');

    await expect(
      harness.container.retroManager.create(owner, team.id, 'Sprint 42'),
    ).rejects.toThrow('not a member');

    expect(await harness.container.retroManager.listByTeam(member, team.id)).toEqual([]);
  });

  it('keeps somebody with no team in the organisation member list', async () => {
    const members = await harness.container.adminManager.listOrgMembers(owner);

    expect(members.map((entry) => entry.name)).toEqual(['Alice', 'Victor']);
    expect(members.find((entry) => entry.name === 'Alice')?.teams).toEqual([]);
  });

  describe('facilitation', () => {
    let teamId: string;
    let retroId: string;

    beforeEach(async () => {
      teamId = await harness.createTeam(owner, [member]);
      retroId = (await harness.container.retroManager.create(owner, teamId, 'Sprint 42')).id;
    });

    it('lets a member take over while the facilitator is away', async () => {
      await harness.container.adminManager.takeFacilitation(member, retroId);

      const board = await harness.container.retroManager.getBoard(member, retroId);

      expect(board.isFacilitator).toBe(true);
    });

    it('refuses while the facilitator is watching the board', async () => {
      const session = harness.container.hub.acquire(retroId);

      session.add({
        name: 'Victor',
        socket: {readyState: 1, OPEN: 1} as never,
        token: 'test',
        userId: owner.userId,
      });

      await expect(
        harness.container.adminManager.takeFacilitation(member, retroId),
      ).rejects.toThrow('The facilitator is here');
    });

    it('lets a team administrator take over even then', async () => {
      const session = harness.container.hub.acquire(retroId);

      session.add({
        name: 'Victor',
        socket: {readyState: 1, OPEN: 1} as never,
        token: 'test',
        userId: owner.userId,
      });
      await harness.container.teamManager.setMemberAdmin(owner, teamId, member.userId, true);

      await expect(
        harness.container.adminManager.takeFacilitation(member, retroId),
      ).resolves.toBeUndefined();
    });

    it('is refused to anybody but the facilitator when handing over', async () => {
      await expect(
        harness.container.adminManager.handOverFacilitation(member, retroId, owner.userId),
      ).rejects.toThrow('Only the facilitator');
    });

    it('refuses to hand over to somebody outside the team', async () => {
      const outsider = await harness.createUser(orgId, 'Bob');

      await expect(
        harness.container.adminManager.handOverFacilitation(owner, retroId, outsider.userId),
      ).rejects.toThrow('member of the team');
    });
  });

  describe('renaming a team', () => {
    let teamId: string;

    beforeEach(async () => {
      teamId = (await harness.container.teamManager.createTeam(member, 'Platform')).id;
    });

    it('is allowed to the team administrator', async () => {
      const team = await harness.container.teamManager.renameTeam(member, teamId, 'Core');

      expect(team).toMatchObject({id: teamId, isAdmin: true, isMember: true, name: 'Core'});
    });

    it('is allowed to an organisation administrator outside the team', async () => {
      const team = await harness.container.teamManager.renameTeam(owner, teamId, 'Core');

      expect(team).toMatchObject({isAdmin: true, isMember: false, name: 'Core'});
    });

    it('is refused to an ordinary member', async () => {
      const bob = await harness.createUser(orgId, 'Bob');

      await harness.container.teamManager.addMember(member, teamId, bob.userId);

      await expect(
        harness.container.teamManager.renameTeam(bob, teamId, 'Core'),
      ).rejects.toMatchObject({status: 403});
    });

    it('does not reveal a team of another organisation', async () => {
      const otherOrg = await harness.createOrg('Globex');
      const stranger = await harness.createUser(otherOrg, 'Eve', 'admin');

      await expect(
        harness.container.teamManager.renameTeam(stranger, teamId, 'Core'),
      ).rejects.toMatchObject({status: 404});

      const [team] = await harness.container.teamManager.listTeams(member);

      expect(team!.name).toBe('Platform');
    });

    /** The DTOs only run over HTTP: the managers above never see a raw body. */
    describe('over HTTP', () => {
      const send = (path: string, method: string, body: object) => {
        const app = new Hono<{Variables: Variables}>();

        app.onError(errorHandler);
        app.use('*', async (context, next) => {
          context.set('auth', member);
          await next();
        });
        app.route('/', teamRoutes(harness.container));
        app.route('/', retroRoutes(harness.container));

        return app.request(path, {
          body: JSON.stringify(body),
          headers: {'content-type': 'application/json'},
          method,
        });
      };

      it('trims the new name', async () => {
        const response = await send(`/teams/${teamId}`, 'PATCH', {name: '  Core  '});

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({name: 'Core'});
      });

      it('refuses a name of blanks or longer than 60 characters', async () => {
        expect((await send(`/teams/${teamId}`, 'PATCH', {name: '   '})).status).toBe(400);
        expect((await send(`/teams/${teamId}`, 'PATCH', {name: 'x'.repeat(61)})).status).toBe(
          400,
        );
      });

      it('refuses a vote budget outside 1 to 10', async () => {
        const created = await send(`/teams/${teamId}/retros`, 'POST', {
          maxVotes: 11,
          title: 'Sprint 42',
        });

        expect(created.status).toBe(400);

        const {id: retroId} = await harness.container.retroManager.create(
          member,
          teamId,
          'Sprint 42',
        );

        expect((await send(`/retros/${retroId}`, 'PATCH', {maxVotes: 0})).status).toBe(400);
        expect((await send(`/retros/${retroId}`, 'PATCH', {maxVotes: 11})).status).toBe(400);
      });
    });
  });
});
