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
