import {Harness} from '../helpers/harness';
import {config} from '~/config';
import type {AuthContext} from '~/Security/AuthContext';

const PASSWORD = 'correct horse battery';

/** ADR-001 D13: the demo tier ceilings are checked where the thing they count is created. */
describe('cloud quotas', () => {
  let harness: Harness;
  let orgId: string;
  let admin: AuthContext;

  beforeEach(async () => {
    harness = Harness.create();
    orgId = await harness.createOrg('Acme');
    admin = await harness.createUser(orgId, 'Victor', 'admin');
    config.edition = 'cloud';
    await harness.container.platformManager.setStatus(
      {...admin, isPlatformAdmin: true},
      orgId,
      'demo',
    );
    admin = {...admin, orgStatus: 'demo'};
  });

  afterEach(async () => {
    config.edition = 'self-hosted';
    await harness.destroy();
  });

  const fillSeats = async (): Promise<void> => {
    // The demo tier holds 15 members, the admin included.
    for (let index = 1; index < 15; index += 1) {
      await harness.createUser(orgId, `Member${index}`);
    }
  };

  it('refuses a fifth retro in the month on the demo tier', async () => {
    const teamId = await harness.createTeam(admin);

    for (let index = 0; index < 4; index += 1) {
      await harness.container.retroManager.create(admin, teamId, `Sprint ${index}`);
    }

    await expect(
      harness.container.retroManager.create(admin, teamId, 'One too many'),
    ).rejects.toThrow('Monthly retrospective limit');
  });

  it('refuses an invitation acceptance once every seat is taken', async () => {
    await fillSeats();

    const send = jest.spyOn(harness.container.mailer, 'send');

    await harness.container.invitationManager.invite(admin, 'late@acme.test');

    const token = send.mock.calls.at(-1)![0].link!.split('/').pop()!;

    send.mockRestore();

    await expect(
      harness.container.invitationManager.accept({name: 'Late', password: PASSWORD, token}),
    ).rejects.toThrow('Member limit');
  });

  it('refuses a verified-domain join once every seat is taken', async () => {
    await harness.container.platformManager.setDomainVerified(
      {...admin, isPlatformAdmin: true},
      orgId,
      'acme.test',
      true,
    );
    await fillSeats();

    await expect(
      harness.registerAndConfirm({email: 'late@acme.test', name: 'Late', password: PASSWORD}),
    ).rejects.toThrow('Member limit');
  });

  it('has no ceiling in the self-hosted edition (ADR-002 D3)', async () => {
    config.edition = 'self-hosted';

    const teamId = await harness.createTeam(admin);

    for (let index = 0; index < 5; index += 1) {
      await harness.container.retroManager.create(admin, teamId, `Sprint ${index}`);
    }
  });
});
