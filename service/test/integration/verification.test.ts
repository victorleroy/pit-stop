import {Hono} from 'hono';
import {Harness} from '../helpers/harness';
import {errorHandler} from '~/Http/errorHandler';
import {authRoutes} from '~/Http/routes/auth';
import type {AuthContext} from '~/Security/AuthContext';

const PASSWORD = 'correct horse battery';

/** Registering by a verified domain proves nothing until the confirmation link is used. */
describe('email verification', () => {
  let harness: Harness;
  let admin: AuthContext;

  beforeEach(async () => {
    harness = Harness.create();

    const orgId = await harness.createOrg('Acme');

    admin = await harness.createUser(orgId, 'Victor', 'admin');
    await harness.container.platformManager.setDomainVerified(
      {...admin, isPlatformAdmin: true},
      orgId,
      'acme.test',
      true,
    );
  });

  afterEach(async () => harness.destroy());

  const linkTokenOf = (send: jest.SpyInstance): string =>
    send.mock.calls.at(-1)![0].link!.split('/').pop()!;

  it('opens no session and keeps no password before the address is confirmed', async () => {
    await harness.container.authManager.register({email: 'ceo@acme.test', name: 'Mallory'});

    const user = await harness.container.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'ceo@acme.test')
      .executeTakeFirstOrThrow();

    const credentials = await harness.container.db
      .selectFrom('credentials')
      .select('kind')
      .where('userId', '=', user.id)
      .execute();

    expect(credentials).toEqual([]);
    await expect(
      harness.container.authManager.loginWithPassword('ceo@acme.test', PASSWORD),
    ).rejects.toThrow('Wrong email or password');
  });

  /**
   * Security review 2026-10-21: the password chosen at registration survived the
   * confirmation, so an outsider registering a colleague's address got their account the
   * moment the colleague clicked the mail. The password is chosen on the link, by whoever
   * holds the mailbox.
   */
  it('lets whoever opens the confirmation link choose the password, never the registrant', async () => {
    const send = jest.spyOn(harness.container.mailer, 'send');

    await harness.container.authManager.register({email: 'ceo@acme.test', name: 'Mallory'});

    const owner = await harness.container.authManager.verifyEmail(linkTokenOf(send), PASSWORD);

    send.mockRestore();

    expect(owner.user.email).toBe('ceo@acme.test');

    const login = await harness.container.authManager.loginWithPassword('ceo@acme.test', PASSWORD);

    expect(login.user.id).toBe(owner.user.id);
  });

  it('lets the real owner take back an address somebody registered without proving it', async () => {
    await harness.container.authManager.register({email: 'ceo@acme.test', name: 'Mallory'});

    const owner = await harness.registerAndConfirm({
      email: 'ceo@acme.test',
      name: 'The CEO',
      password: PASSWORD,
    });

    expect(owner.user.name).toBe('The CEO');
  });

  it('opens the account to an invitation that proves the address', async () => {
    await harness.container.authManager.register({email: 'cto@acme.test', name: 'Mallory'});

    const send = jest.spyOn(harness.container.mailer, 'send');

    await harness.container.invitationManager.invite(admin, 'cto@acme.test', 'admin');

    const token = linkTokenOf(send);

    send.mockRestore();
    await harness.container.invitationManager.accept({name: 'The CTO', password: PASSWORD, token});

    const login = await harness.container.authManager.loginWithPassword('cto@acme.test', PASSWORD);

    expect(login.user).toMatchObject({isOrgAdmin: true, name: 'The CTO'});
  });

  it('asks a proven account to sign in before accepting, rather than taking a new password', async () => {
    await harness.registerAndConfirm({email: 'dev@acme.test', name: 'Dev', password: PASSWORD});

    const send = jest.spyOn(harness.container.mailer, 'send');

    await harness.container.invitationManager.invite(admin, 'dev@acme.test', 'admin');

    const token = send.mock.calls.at(-1)![0].link!.split('/').pop()!;

    send.mockRestore();

    await expect(
      harness.container.invitationManager.accept({
        name: 'Intruder',
        password: 'a password of my own',
        token,
      }),
    ).rejects.toThrow('sign in, then open the invitation again');
  });

  it('refuses a confirmation link twice', async () => {
    const send = jest.spyOn(harness.container.mailer, 'send');

    await harness.container.authManager.register({email: 'once@acme.test', name: 'Once'});

    const token = linkTokenOf(send);

    send.mockRestore();
    await harness.container.authManager.verifyEmail(token, PASSWORD);

    await expect(harness.container.authManager.verifyEmail(token, PASSWORD)).rejects.toThrow(
      'no longer valid',
    );
  });

  /** Regression: registering again left the first link valid next to the new one. */
  it('voids the earlier confirmation links when the address is registered again', async () => {
    const send = jest.spyOn(harness.container.mailer, 'send');

    await harness.container.authManager.register({email: 'ceo@acme.test', name: 'The CEO'});

    const firstToken = linkTokenOf(send);

    await harness.container.authManager.register({email: 'ceo@acme.test', name: 'Mallory'});
    send.mockRestore();

    await expect(harness.container.authManager.verifyEmail(firstToken, PASSWORD)).rejects.toThrow(
      'no longer valid',
    );
  });

  /**
   * Security review 2026-10-21: a quoted local part may hold "@", so the first "@" is not
   * the domain. The verified-domain check read acme.test while the link went to the other
   * domain's mail server.
   */
  const SMUGGLED = '"x@acme.test@"@attacker.test';

  it('takes the domain after the last "@", whatever the local part holds', async () => {
    await expect(
      harness.container.authManager.register({email: SMUGGLED, name: 'Eve'}),
    ).rejects.toThrow('invitation only');
  });

  it('refuses an address with a quoted local part at the door', async () => {
    const app = new Hono();

    app.onError(errorHandler);
    app.route('/', authRoutes(harness.container));

    const send = jest.spyOn(harness.container.mailer, 'send');
    const response = await app.request('/auth/register', {
      body: JSON.stringify({email: SMUGGLED, name: 'Eve'}),
      headers: {'content-type': 'application/json'},
      method: 'POST',
    });

    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });
});
