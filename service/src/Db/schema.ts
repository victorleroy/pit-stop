import type {Generated} from 'kysely';

/**
 * Each phase joins this list with the feature that ships it, so the API refuses a phase that
 * the database CHECK already accepts but nothing handles yet (ADR 0005).
 */
export const RETRO_PHASES = [
  'LOBBY',
  'ICEBREAKER',
  'REVIEW',
  'BRAINSTORM',
  'SHARE',
  'VOTE',
  'DISCUSS',
  'ARCHIVED',
] as const;
export type RetroPhase = (typeof RETRO_PHASES)[number];

/** Before the board: a retro passes through them once, in this order, skipping the unused. */
export const OPENING_PHASES = ['LOBBY', 'ICEBREAKER', 'REVIEW'] as const;

export const ACTION_STATUSES = ['OPEN', 'DONE', 'DROPPED'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const ACTION_REVIEW_OUTCOMES = ['DONE', 'DROPPED', 'KEPT'] as const;
export type ActionReviewOutcome = (typeof ACTION_REVIEW_OUTCOMES)[number];

export const ORG_STATUSES = ['demo', 'active', 'suspended'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const ORG_ROLES = ['member', 'admin'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export type CredentialKind = 'google' | 'password';

export const NAME_SOURCES = ['sso', 'user'] as const;
export type NameSource = (typeof NAME_SOURCES)[number];

/** `preset` is reserved by the CHECK constraint for illustrated avatars; nothing writes it yet. */
export const AVATAR_SOURCES = ['auto', 'upload', 'initials', 'preset'] as const;
export type AvatarSource = (typeof AVATAR_SOURCES)[number];

export const AVATAR_MIMES = ['image/webp', 'image/jpeg'] as const;
export type AvatarMime = (typeof AVATAR_MIMES)[number];

interface UsersTable {
  id: string;
  email: string;
  name: string;
  pictureUrl: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  nameSource: Generated<NameSource>;
  ssoName: string | null;
  ssoPictureUrl: string | null;
  avatarSource: Generated<AvatarSource>;
}

interface UserAvatarsTable {
  id: string;
  userId: string;
  mime: AvatarMime;
  bytes: Buffer;
  size: number;
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
  defaultTemplateId: string | null;
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
  templateId: string | null;
  templateName: string | null;
  defaultTimerSeconds: number | null;
  icebreakerQuestionId: string | null;
  icebreakerAskedAt: string | null;
  actionReview: Generated<number>;
  reviewFocusActionId: string | null;
}

interface IcebreakerAnswersTable {
  retroId: string;
  userId: string;
  text: string;
  revealed: Generated<number>;
  createdAt: string;
  updatedAt: string;
}

interface ColumnsTable {
  id: string;
  retroId: string;
  title: string;
  position: number;
  prompt: string | null;
}

interface RetroTemplatesTable {
  id: string;
  orgId: string;
  teamId: string;
  name: string;
  nameKey: string;
  description: string | null;
  maxVotes: number | null;
  timerSeconds: number | null;
  icebreaker: number | null;
  actionReview: number | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface RetroTemplateColumnsTable {
  templateId: string;
  position: number;
  title: string;
  prompt: string | null;
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
  /** Set by every close, cleared by a reopen; NULL for actions closed before it existed. */
  closedAt: string | null;
}

interface ActionReviewsTable {
  id: string;
  orgId: string;
  teamId: string;
  actionId: string;
  retroId: string;
  outcome: ActionReviewOutcome;
  comment: string | null;
  reviewedBy: string | null;
  reviewedAt: string;
}

export interface Database {
  users: UsersTable;
  userAvatars: UserAvatarsTable;
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
  actionReviews: ActionReviewsTable;
  retroTemplates: RetroTemplatesTable;
  retroTemplateColumns: RetroTemplateColumnsTable;
  icebreakerAnswers: IcebreakerAnswersTable;
}
