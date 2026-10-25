import {planFor} from '~/Security/Plans';

/** ADR-001 D13 and ADR-002 D3: quotas belong to the cloud, suspension to every edition. */
describe('planFor', () => {
  it('lifts every ceiling in the self-hosted edition', () => {
    expect(planFor('demo', 'self-hosted')).toMatchObject({
      canExport: true,
      invitationsPerDay: Number.POSITIVE_INFINITY,
      maxMembers: Number.POSITIVE_INFINITY,
      maxRetrosPerMonth: Number.POSITIVE_INFINITY,
    });
  });

  it('keeps a suspended organisation closed in the self-hosted edition', () => {
    expect(planFor('suspended', 'self-hosted')).toMatchObject({invitationsPerDay: 0});
  });

  it('applies the demo tier in the cloud', () => {
    expect(planFor('demo', 'cloud')).toMatchObject({invitationsPerDay: 10, maxMembers: 15});
  });

  it('falls back to the demo tier on an unknown status in the cloud', () => {
    expect(planFor('unknown' as never, 'cloud')).toMatchObject({invitationsPerDay: 10});
  });
});
