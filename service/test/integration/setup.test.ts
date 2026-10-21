import {Harness} from '../helpers/harness';

/** ADR-002 D6: the first administrator of an empty instance comes from a link in the logs. */
describe('first boot setup', () => {
  let harness: Harness;

  const input = (token: string) => ({
    email: 'Operator@Example.test',
    name: 'Operator',
    orgName: 'Example',
    password: 'correct horse battery',
    token,
  });

  beforeEach(() => {
    harness = Harness.create();
  });

  afterEach(async () => harness.destroy());

  it('is required while no organisation exists', async () => {
    expect(await harness.container.setupManager.isRequired()).toBe(true);
  });

  it('creates the organisation and its first administrator, then signs them in', async () => {
    const token = (await harness.container.setupManager.announce())!;

    const response = await harness.container.setupManager.complete(input(token));

    expect(response.token).toBeTruthy();
    expect(response.user).toMatchObject({
      email: 'operator@example.test',
      isOrgAdmin: true,
      orgName: 'Example',
      orgStatus: 'active',
    });
    expect(await harness.container.setupManager.isRequired()).toBe(false);

    const login = await harness.container.authManager.loginWithPassword(
      'operator@example.test',
      'correct horse battery',
    );

    expect(login.user.orgId).toBe(response.user.orgId);
  });

  it('refuses a token that is not the one printed in the logs', async () => {
    await harness.container.setupManager.announce();

    await expect(harness.container.setupManager.complete(input('made-up'))).rejects.toThrow(
      'not valid',
    );
  });

  it('works once only', async () => {
    const token = (await harness.container.setupManager.announce())!;

    await harness.container.setupManager.complete(input(token));

    await expect(harness.container.setupManager.complete(input(token))).rejects.toThrow(
      'not valid',
    );
  });

  it('prints nothing and accepts nothing once an organisation exists', async () => {
    await harness.createOrg('Acme');

    expect(await harness.container.setupManager.announce()).toBeUndefined();
    await expect(harness.container.setupManager.complete(input('anything'))).rejects.toThrow(
      'not valid',
    );
  });

  it('lets only one of two racing submissions through', async () => {
    const token = (await harness.container.setupManager.announce())!;

    const results = await Promise.allSettled([
      harness.container.setupManager.complete(input(token)),
      harness.container.setupManager.complete({...input(token), email: 'other@example.test'}),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });
});
