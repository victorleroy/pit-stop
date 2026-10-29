import type {OrgStatus} from '~/Db/schema';

/** What the paddock is allowed to see: metadata and counters, never content (ADR-001 D8). */
export interface OrgSummaryModel {
  createdAt: string;
  domains: {domain: string; verified: boolean}[];
  id: string;
  lastActivityAt?: string;
  memberCount: number;
  name: string;
  retroCount: number;
  status: OrgStatus;
  teamCount: number;
}

export interface OrgQuotaModel {
  invitationsPerDay: number;
  maxMembers: number;
  maxRetrosPerMonth: number;
  retentionDays?: number;
  canExport: boolean;
}

export const STATS_PERIODS = ['30d', '90d', 'all'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

/**
 * The org admin's view of activity across every team: counters and nothing else. No note
 * text, no title, no author, no votes per person, so it says nothing a board would not.
 */
export interface OrgStatsModel {
  actions: {done: number; dropped: number; open: number};
  notes: {count: number; perRetro: number};
  people: {admins: number; total: number};
  period: StatsPeriod;
  retros: {count: number; total: number};
  teams: {idle: number; total: number};
}
