import {config} from '~/config';
import type {Edition} from '~/config';
import type {OrgStatus} from '~/Db/schema';
import {ForbiddenHttpError} from '~/Error/HttpError';
import type {OrgQuotaModel} from '~/Model/OrgModel';
import type {OrgRepository} from '~/Repository/OrgRepository';
import type {RetroRepository} from '~/Repository/RetroRepository';

/**
 * Quotas live in exactly one place (ADR-001 D13). No `if (status === 'demo')` anywhere else.
 *
 * `demo` is a quota tier, never a security tier: isolation, anonymity and durability are
 * identical on every tier, only ceilings change.
 */
const PLANS: Record<OrgStatus, OrgQuotaModel> = {
  active: {
    canExport: true,
    invitationsPerDay: 50,
    maxMembers: Number.POSITIVE_INFINITY,
    maxRetrosPerMonth: Number.POSITIVE_INFINITY,
  },
  demo: {
    canExport: false,
    invitationsPerDay: 10,
    maxMembers: 15,
    maxRetrosPerMonth: 4,
    retentionDays: 90,
  },
  suspended: {
    canExport: false,
    invitationsPerDay: 0,
    maxMembers: 0,
    maxRetrosPerMonth: 0,
  },
};

const UNLIMITED: OrgQuotaModel = {
  canExport: true,
  invitationsPerDay: Number.POSITIVE_INFINITY,
  maxMembers: Number.POSITIVE_INFINITY,
  maxRetrosPerMonth: Number.POSITIVE_INFINITY,
};

/**
 * The self-hosted edition has no ceilings (ADR-002 D3), but a suspension stays closed: it is
 * an operator decision, not a quota.
 *
 * Unknown status falls back to the tightest tier: fail-closed, like ScopedDb.
 */
export const planFor = (status: OrgStatus, edition: Edition = config.edition): OrgQuotaModel => {
  if (edition === 'self-hosted' && status !== 'suspended') {
    return UNLIMITED;
  }

  return PLANS[status] ?? PLANS.demo;
};

/** Checked wherever somebody joins: an invitation accepted, or a verified domain walked into. */
export const checkSeatAvailable = async (
  orgRepository: OrgRepository,
  orgId: string,
): Promise<void> => {
  const org = await orgRepository.findOneById(orgId);

  if (org && (await orgRepository.countMembers(orgId)) >= planFor(org.status).maxMembers) {
    throw new ForbiddenHttpError('Member limit reached for this organisation');
  }
};

/** Counted per calendar month, in UTC. */
export const checkRetroAllowance = async (
  retroRepository: RetroRepository,
  orgId: string,
  status: OrgStatus,
): Promise<void> => {
  const {maxRetrosPerMonth} = planFor(status);

  if (maxRetrosPerMonth === Number.POSITIVE_INFINITY) {
    return;
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  if ((await retroRepository.countCreatedSince(orgId, monthStart)) >= maxRetrosPerMonth) {
    throw new ForbiddenHttpError('Monthly retrospective limit reached for this organisation');
  }
};
