import type {Generated} from 'kysely';

export const RETRO_PHASES = ['BRAINSTORM', 'SHARE', 'VOTE', 'DISCUSS', 'ARCHIVED'] as const;
export type RetroPhase = (typeof RETRO_PHASES)[number];

export const ACTION_STATUSES = ['OPEN', 'DONE', 'DROPPED'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const ORG_STATUSES = ['demo', 'active', 'suspended'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const ORG_ROLES = ['member', 'admin'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export type CredentialKind = 'google' | 'password';

interface UsersTable {
  id: string;
  email: string;
  name: string;
  pictureUrl: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

interface CredentialsTable {
  userId: string;
  kind: CredentialKind;
  providerId: string | null;
  passwordHash: string | null;
  createdAt: string;
}

interface SessionsTable {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

interface OrganizationsTable {
  id: string;
  name: string;
  status: Generated<OrgStatus>;
  createdAt: string;
}

interface OrgDomainsTable {
  domain: string;
  orgId: string;
  verifiedAt: string | null;
}

interface OrgMembersTable {
  orgId: string;
  userId: string;
  role: Generated<OrgRole>;
  createdAt: string;
}

interface InvitationsTable {
  id: string;
  orgId: string;
  email: string;
  role: Generated<OrgRole>;
  tokenHash: string;
  invitedBy: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface PasswordResetsTable {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

interface EmailVerificationsTable {
  tokenHash: string;
  userId: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

interface TeamsTable {
  id: string;
  orgId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

interface MembershipsTable {
  teamId: string;
  userId: string;
  isAdmin: Generated<number>;
  createdAt: string;
}

interface RetrosTable {
  id: string;
  orgId: string;
  teamId: string;
  title: string;
  phase: Generated<RetroPhase>;
  createdBy: string;
  facilitatorId: string;
  maxVotes: Generated<number>;
  timerEndsAt: string | null;
  timerRemainingMs: number | null;
  timerTotalMs: number | null;
  createdAt: string;
}

interface ColumnsTable {
  id: string;
  retroId: string;
  title: string;
  position: number;
}

interface ClustersTable {
  id: string;
  retroId: string;
  columnId: string;
  title: string | null;
}

interface NotesTable {
  id: string;
  retroId: string;
  columnId: string;
  clusterId: string | null;
  authorId: string;
  text: string;
  revealed: Generated<number>;
  createdAt: string;
}

interface VotesTable {
  retroId: string;
  userId: string;
  targetId: string;
  count: number;
}

interface ActionsTable {
  id: string;
  orgId: string;
  teamId: string;
  retroId: string | null;
  text: string;
  status: Generated<ActionStatus>;
  assigneeId: string | null;
  createdAt: string;
}

export interface Database {
  users: UsersTable;
  credentials: CredentialsTable;
  sessions: SessionsTable;
  organizations: OrganizationsTable;
  orgDomains: OrgDomainsTable;
  orgMembers: OrgMembersTable;
  invitations: InvitationsTable;
  passwordResets: PasswordResetsTable;
  emailVerifications: EmailVerificationsTable;
  teams: TeamsTable;
  memberships: MembershipsTable;
  retros: RetrosTable;
  columns: ColumnsTable;
  clusters: ClustersTable;
  notes: NotesTable;
  votes: VotesTable;
  actions: ActionsTable;
}
