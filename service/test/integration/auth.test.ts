import {Harness} from '../helpers/harness';
import {config} from '~/config';
import type {AuthContext} from '~/Security/AuthContext';
import {TokenService} from '~/Security/TokenService';

/** ADR-001 D4, D7 and D12: identity, revocable sessions, and the way into the product. */
describe('authentication and invitations', () => {
  let harness: Harness;
  let orgId: string;
  let admin: AuthContext;

  beforeEach(async () => {
    harness = Harness.create();
    orgId = await harness.createOrg('Acme');
    admin = await harness.createUser(orgId, 'Victor', 'admin');
  });

  afterEach(async () => {
    config.edition = 'self-hosted';
    await harness.destroy();
  });

  describe('registration', () => {
    it('refuses an unknown email with no invitation and no verified domain', async () => {
      await expect(
        harness.container.authManager.register({
          email: 'stranger@nowhere.test',
          name: 'Stranger',
        }),
      ).rejects.toThrow('invitation only');
    });

    it('lets somebody in when their email domain is verified for an organisation', async () => {
      await harness.container.platformManager.setDomainVerified(
        {...admin, isPlatformAdmin: true},
        orgId,
        'acme.test',
        true,
      );

      const response = await harness.registerAndConfirm({
        email: 'newcomer@acme.test',
        name: 'Newcomer',
        password: 'correct horse battery',
      });

      expect(response.user.orgId).toBe(orgId);
      // Auto-join never grants admin: that role goes through an invitation (ADR-001 D12).
      expect(response.user.isOrgAdmin).toBe(false);
    });

    it('refuses a second account for the same email', async () => {
      await harness.container.platformManager.setDomainVerified(
        {...admin, isPlatformAdmin: true},
        orgId,
        'acme.test',
        true,
      );

      await harness.registerAndConfirm({
        email: 'twice@acme.test',
        name: 'Twice',
        password: 'correct horse battery',
      });

      await expect(
        harness.container.authManager.register({
          email: 'twice@acme.test',
          name: 'Twice',
        }),
      ).rejects.toThrow('already exists');
    });
  });

  describe('password login', () => {
    beforeEach(async () => {
      await harness.container.platformManager.setDomainVerified(
        {...admin, isPlatformAdmin: true},
        orgId,
        'acme.test',
        true,
      );
      await harness.registerAndConfirm({
        email: 'user@acme.test',
        name: 'User',
        password: 'correct horse battery',
      });
    });

    it('signs in with the right password', async () => {
      const response = await harness.container.authManager.loginWithPassword(
        'user@acme.test',
        'correct horse battery',
      );

      expect(response.token).toHaveLength(43);
      expect(response.user.email).toBe('user@acme.test');
    });

    it('gives the same error for a wrong password and an unknown account', async () => {
      const wrong = harness.container.authManager
        .loginWithPassword('user@acme.test', 'nope')
        .catch((error: Error) => error.message);

      const unknown = harness.container.authManager
        .loginWithPassword('ghost@acme.test', 'nope')
        .catch((error: Error) => error.message);

      expect(await wrong).toBe(await unknown);
    });

    /** Without the hash work, an unknown account answered faster than a known one. */
    it('pays the password hash cost for an unknown account too', async () => {
      const timed = async (email: string): Promise<number> => {
        const started = performance.now();

        await harness.container.authManager.loginWithPassword(email, 'nope').catch(() => undefined);

        return performance.now() - started;
      };

      // Warm-up: the first call also pays for the dummy hash itself.
      await timed('warmup@acme.test');

      const known = await timed('user@acme.test');
      const unknown = await timed('ghost@acme.test');

      // A generous bound: without the dummy verify an unknown account answered in well under
      // a tenth of the hash cost.
      expect(unknown).toBeGreaterThan(known * 0.4);
    });
  });

  describe('sessions', () => {
    it('resolves a session into a scoped context', async () => {
      await harness.container.platformManager.setDomainVerified(
        {...admin, isPlatformAdmin: true},
        orgId,
        'acme.test',
        true,
      );

      const {token} = await harness.registerAndConfirm({
        email: 'session@acme.test',
        name: 'Session',
        password: 'correct horse battery',
      });

      const context = await harness.container.authManager.resolveSession(token);

      expect(context?.orgId).toBe(orgId);
      expect(context?.db.orgId).toBe(orgId);
    });

    it('stops resolving once the session is revoked', async () => {
      await harness.container.platformManager.setDomainVerified(
        {...admin, isPlatformAdmin: true},
        orgId,
        'acme.test',
        true,
      );

      const {token} = await harness.registerAndConfirm({
        email: 'revoked@acme.test',
        name: 'Revoked',
        password: 'correct horse battery',
      });

      await harness.container.authManager.logout(token);

      expect(await harness.container.authManager.resolveSession(token)).toBeUndefined();
    });

    it('cuts every live session when the organisation is suspended', async () => {
      await harness.container.platformManager.setDomainVerified(
        {...admin, isPlatformAdmin: true},
        orgId,
        'acme.test',
        true,
      );

      const {token} = await harness.registerAndConfirm({
        email: 'suspended@acme.test',
        name: 'Suspended',
        password: 'correct horse battery',
      });

      expect(await harness.container.authManager.resolveSession(token)).toBeDefined();

      await harness.container.platformManager.setStatus(
        {...admin, isPlatformAdmin: true},
        orgId,
        'suspended',
      );

      expect(await harness.container.authManager.resolveSession(token)).toBeUndefined();
    });

    it('rejects a token that was never issued', async () => {
      expect(await harness.container.authManager.resolveSession('made-up')).toBeUndefined();
    });

    it('purges expired sessions and spent or expired one-time tokens, and nothing else', async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      const future = new Date(Date.now() + 60 * 60_000).toISOString();
      const now = new Date().toISOString();
      const {db} = harness.container;

      await db
        .insertInto('sessions')
        .values([
          {createdAt: now, expiresAt: past, tokenHash: 'session-expired', userId: admin.userId},
          {createdAt: now, expiresAt: future, tokenHash: 'session-live', userId: admin.userId},
        ])
        .execute();

      for (const table of ['passwordResets', 'emailVerifications'] as const) {
        await db
          .insertInto(table)
          .values([
            {createdAt: now, expiresAt: past, tokenHash: 'expired', usedAt: null, userId: admin.userId},
            {createdAt: now, expiresAt: future, tokenHash: 'spent', usedAt: now, userId: admin.userId},
            {createdAt: now, expiresAt: future, tokenHash: 'live', usedAt: null, userId: admin.userId},
          ])
          .execute();
      }

      await harness.container.authManager.purgeExpired();

      const hashes = async (table: 'emailVerifications' | 'passwordResets' | 'sessions') =>
        (await db.selectFrom(table).select('tokenHash').execute()).map((row) => row.tokenHash);

      expect(await hashes('sessions')).toEqual(['session-live']);
      expect(await hashes('passwordResets')).toEqual(['live']);
      expect(await hashes('emailVerifications')).toEqual(['live']);
    });
  });

  describe('invitations', () => {
    it('is refused to somebody who is not an organisation administrator', async () => {
      const member = await harness.createUser(orgId, 'Alice');

      await expect(
        harness.container.invitationManager.invite(member, 'guest@acme.test'),
      ).rejects.toThrow('Only an organisation administrator');
    });

    it('records a pending invitation', async () => {
      const invitation = await harness.container.invitationManager.invite(admin, 'guest@acme.test');

      expect(invitation).toMatchObject({
        email: 'guest@acme.test',
        role: 'member',
        status: 'pending',
      });

      const listed = await harness.container.invitationManager.list(admin);

      expect(listed).toHaveLength(1);
    });

    it('enforces the daily ceiling that protects the email allowance in the cloud', async () => {
      // The demo tier allows 10 a day (ADR-001 D13).
      config.edition = 'cloud';
      await harness.container.platformManager.setStatus(
        {...admin, isPlatformAdmin: true},
        orgId,
        'demo',
      );

      for (let index = 0; index < 10; index += 1) {
        await harness.container.invitationManager.invite(admin, `guest${index}@acme.test`);
      }

      await expect(
        harness.container.invitationManager.invite(admin, 'one-too-many@acme.test'),
      ).rejects.toThrow('Daily invitation limit');
    });

    it('has no daily ceiling in the self-hosted edition (ADR-002 D3)', async () => {
      await harness.container.platformManager.setStatus(
        {...admin, isPlatformAdmin: true},
        orgId,
        'demo',
      );

      for (let index = 0; index < 11; index += 1) {
        await harness.container.invitationManager.invite(admin, `guest${index}@acme.test`);
      }

      expect(await harness.container.invitationManager.list(admin)).toHaveLength(11);
    });

    it('revokes an invitation', async () => {
      const invitation = await harness.container.invitationManager.invite(admin, 'guest@acme.test');

      await harness.container.invitationManager.revoke(admin, invitation.id);

      const listed = await harness.container.invitationManager.list(admin);

      expect(listed[0]!.status).toBe('revoked');
    });

    it('refuses to revoke an invitation of another organisation', async () => {
      const otherOrg = await harness.createOrg('Globex');
      const otherAdmin = await harness.createUser(otherOrg, 'Mallory', 'admin');
      const invitation = await harness.container.invitationManager.invite(admin, 'guest@acme.test');

      await expect(
        harness.container.invitationManager.revoke(otherAdmin, invitation.id),
      ).rejects.toThrow('not found');
    });

    /** One organisation per account in v1: a second membership left the session org random. */
    it('refuses an invitation from another organisation to somebody already in one', async () => {
      const alice = await harness.createUser(orgId, 'Alice');
      const globexId = await harness.createOrg('Globex');
      const globexAdmin = await harness.createUser(globexId, 'Mallory', 'admin');
      const send = jest.spyOn(harness.container.mailer, 'send');

      await harness.container.invitationManager.invite(globexAdmin, alice.email);

      const token = send.mock.calls.at(-1)![0].link!.split('/').pop()!;

      send.mockRestore();

      await expect(
        harness.container.invitationManager.accept({token, userId: alice.userId}),
      ).rejects.toThrow('already belongs to another organisation');

      const memberships = await harness.container.db
        .selectFrom('orgMembers')
        .select('orgId')
        .where('userId', '=', alice.userId)
        .execute();

      expect(memberships).toEqual([{orgId}]);
    });

    /** Regression: a refused mail left an organisation with no admin squatting its domain. */
    it('leaves nothing behind when the first admin invitation cannot be sent', async () => {
      const platform: AuthContext = {...admin, isPlatformAdmin: true};
      const send = jest
        .spyOn(harness.container.mailer, 'send')
        .mockRejectedValueOnce(new Error('mail refused'));

      await expect(
        harness.container.platformManager.createOrganization(
          platform,
          'Initech',
          'boss@initech.test',
          'initech.test',
        ),
      ).rejects.toThrow('mail refused');

      send.mockRestore();

      const orgs = await harness.container.platformManager.listOrganizations(platform);

      expect(orgs.map((org) => org.name)).toEqual(['Acme']);
      await expect(
        harness.container.platformManager.createOrganization(
          platform,
          'Initech',
          'boss@initech.test',
          'initech.test',
        ),
      ).resolves.toMatchObject({invitation: {status: 'pending'}});
    });

    it('rejects a token that does not match any invitation', async () => {
      await expect(
        harness.container.invitationManager.accept({token: 'made-up'}),
      ).rejects.toThrow('not valid');
    });

    it('lets the platform admin create an organisation and invite its first admin', async () => {
      const platform: AuthContext = {...admin, isPlatformAdmin: true};
      const created = await harness.container.platformManager.createOrganization(
        platform,
        'Initech',
        'boss@initech.test',
      );

      expect(created.invitation).toMatchObject({role: 'admin', status: 'pending'});

      const orgs = await harness.container.platformManager.listOrganizations(platform);
      const initech = orgs.find((org) => org.name === 'Initech')!;

      // Self-hosted has no tiers: the organisation starts active, with zero members until
      // acceptance (ADR-002 D3).
      expect(initech.status).toBe('active');
      expect(initech.memberCount).toBe(0);
    });

    it('starts a cloud organisation on the demo tier (ADR-001 D13)', async () => {
      config.edition = 'cloud';

      const platform: AuthContext = {...admin, isPlatformAdmin: true};

      await harness.container.platformManager.createOrganization(
        platform,
        'Initech',
        'boss@initech.test',
      );

      const orgs = await harness.container.platformManager.listOrganizations(platform);

      expect(orgs.find((org) => org.name === 'Initech')!.status).toBe('demo');
    });
  });
});

describe('password reset', () => {
  let harness: Harness;
  let orgId: string;
  let admin: AuthContext;

  beforeEach(async () => {
    harness = Harness.create();
    orgId = await harness.createOrg('Acme');
    admin = await harness.createUser(orgId, 'Victor', 'admin');

    await harness.container.platformManager.setDomainVerified(
      {...admin, isPlatformAdmin: true},
      orgId,
      'acme.test',
      true,
    );
  });

  afterEach(async () => harness.destroy());

  it('stays silent about whether the address is known', async () => {
    await expect(
      harness.container.passwordResetManager.request('ghost@acme.test'),
    ).resolves.toBeUndefined();
  });

  it('refuses a token that does not exist', async () => {
    await expect(
      harness.container.passwordResetManager.confirm('made-up', 'a brand new password'),
    ).rejects.toThrow('no longer valid');
  });

  it('changes the password and cuts every live session', async () => {
    const {token: session} = await harness.registerAndConfirm({
      email: 'reset@acme.test',
      name: 'Reset',
      password: 'correct horse battery',
    });

    const user = await harness.container.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'reset@acme.test')
      .executeTakeFirstOrThrow();

    const reset = TokenService.generate();

    await harness.container.db
      .insertInto('passwordResets')
      .values({
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        tokenHash: TokenService.hash(reset),
        usedAt: null,
        userId: user.id,
      })
      .execute();

    await harness.container.passwordResetManager.confirm(reset, 'a brand new password');

    expect(await harness.container.authManager.resolveSession(session)).toBeUndefined();

    await expect(
      harness.container.authManager.loginWithPassword('reset@acme.test', 'a brand new password'),
    ).resolves.toBeDefined();
  });

  it('refuses to use the same reset token twice', async () => {
    await harness.registerAndConfirm({
      email: 'once@acme.test',
      name: 'Once',
      password: 'correct horse battery',
    });

    const user = await harness.container.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'once@acme.test')
      .executeTakeFirstOrThrow();

    const reset = TokenService.generate();

    await harness.container.db
      .insertInto('passwordResets')
      .values({
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        tokenHash: TokenService.hash(reset),
        usedAt: null,
        userId: user.id,
      })
      .execute();

    await harness.container.passwordResetManager.confirm(reset, 'a brand new password');

    await expect(
      harness.container.passwordResetManager.confirm(reset, 'another password here'),
    ).rejects.toThrow('no longer valid');
  });
});

describe('domain claims', () => {
  let harness: Harness;
  let platform: AuthContext;

  beforeEach(async () => {
    harness = Harness.create();

    const orgId = await harness.createOrg('Acme');
    const admin = await harness.createUser(orgId, 'Victor', 'admin');

    platform = {...admin, isPlatformAdmin: true};
  });

  afterEach(async () => harness.destroy());

  /**
   * Regression: the paddock creates a domain unverified, so the dev shortcut used to miss
   * it and invent a second organisation for the same company.
   */
  it('never invents a second organisation for a domain somebody already claims', async () => {
    await harness.container.platformManager.createOrganization(
      platform,
      'Globex',
      'dana@globex.test',
      'globex.test',
    );

    const before = await harness.container.platformManager.listOrganizations(platform);

    const response = await harness.container.authManager.devLogin('dana@globex.test', 'Dana');

    const after = await harness.container.platformManager.listOrganizations(platform);

    expect(after).toHaveLength(before.length);
    expect(response.user.orgName).toBe('Globex');
    // Joining by an unverified claim is not an invitation: no admin rights come with it.
    expect(response.user.isOrgAdmin).toBe(false);
  });

  /**
   * A verified domain lets anybody with an address on it walk into the organisation, so a
   * domain claimed elsewhere must never change hands on a mistyped paddock form.
   */
  it('refuses to claim a domain that already belongs to another organisation', async () => {
    await harness.container.platformManager.createOrganization(
      platform,
      'Globex',
      'dana@globex.test',
      'globex.test',
    );

    const orgs = await harness.container.platformManager.listOrganizations(platform);
    const acmeId = orgs.find((org) => org.name === 'Acme')!.id;

    await expect(
      harness.container.platformManager.setDomainVerified(
        platform,
        acmeId,
        'globex.test',
        true,
      ),
    ).rejects.toThrow('already belongs to another organisation');

    const after = await harness.container.platformManager.listOrganizations(platform);

    expect(after.find((org) => org.name === 'Globex')!.domains).toEqual([
      {domain: 'globex.test', verified: false},
    ]);
    expect(after.find((org) => org.name === 'Acme')!.domains).toEqual([]);
  });

  it('refuses to create an organisation on a domain somebody else claims', async () => {
    await harness.container.platformManager.createOrganization(
      platform,
      'Globex',
      'dana@globex.test',
      'globex.test',
    );

    await expect(
      harness.container.platformManager.createOrganization(
        platform,
        'Initech',
        'boss@initech.test',
        'globex.test',
      ),
    ).rejects.toThrow('already belongs to another organisation');

    const orgs = await harness.container.platformManager.listOrganizations(platform);

    expect(orgs.map((org) => org.name).sort()).toEqual(['Acme', 'Globex']);
  });

  it('lets a released domain be claimed by another organisation', async () => {
    const globex = await harness.container.platformManager.createOrganization(
      platform,
      'Globex',
      'dana@globex.test',
      'globex.test',
    );

    const orgs = await harness.container.platformManager.listOrganizations(platform);
    const acmeId = orgs.find((org) => org.name === 'Acme')!.id;

    await harness.container.platformManager.removeDomain(platform, globex.orgId, 'globex.test');

    await expect(
      harness.container.platformManager.setDomainVerified(platform, acmeId, 'globex.test', true),
    ).resolves.toBeUndefined();
  });

  it('still bootstraps a local organisation when nothing claims the domain', async () => {
    const response = await harness.container.authManager.devLogin('solo@nobody.test', 'Solo');

    expect(response.user.orgName).toBe('nobody.test');
    expect(response.user.isOrgAdmin).toBe(true);
  });

  it('refuses a plain registration on a claimed but unverified domain', async () => {
    await harness.container.platformManager.createOrganization(
      platform,
      'Globex',
      'dana@globex.test',
      'globex.test',
    );

    // Only a verified domain or an invitation gets somebody in: an unverified claim must not
    // become a way to walk into another company.
    await expect(
      harness.container.authManager.register({
        email: 'intruder@globex.test',
        name: 'Intruder',
      }),
    ).rejects.toThrow('invitation only');
  });
});
