export type OrgStatus = 'demo' | 'active' | 'suspended';

export interface User {
  email: string;
  id: string;
  isOrgAdmin?: boolean;
  /** Derived from configuration on the service, never stored: paddock access. */
  isPlatformAdmin?: boolean;
  name: string;
  orgId: string;
  orgName?: string;
  orgStatus?: OrgStatus;
  pictureUrl?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Team {
  createdAt?: string;
  createdBy: string;
  id: string;
  isAdmin: boolean;
  isMember: boolean;
  memberCount: number;
  name: string;
}

export interface TeamMember {
  email: string;
  isAdmin: boolean;
  joinedAt?: string;
  name: string;
  pictureUrl?: string;
  userId: string;
}

export interface TeamSummary {
  actionCount: number;
  retroCount: number;
}

export type RetroPhase = 'BRAINSTORM' | 'SHARE' | 'VOTE' | 'DISCUSS' | 'ARCHIVED';

export interface NoteAuthor {
  id: string;
  name: string;
}

export interface Note {
  /** Always known: a retro hides what was written, never who was in the room. */
  author: NoteAuthor;
  columnId: string;
  createdAt?: string;
  id: string;
  isMine: boolean;
  /** False means the service withheld the text and `text` is empty. */
  revealed: boolean;
  text: string;
}

export interface Card {
  id: string;
  myVotes: number;
  notes: Note[];
  title?: string;
  totalVotes?: number;
  type: 'cluster' | 'note';
}

export interface Column {
  cards: Card[];
  id: string;
  order: number;
  title: string;
}

export interface RetroSummary {
  createdAt?: string;
  createdBy: string;
  id: string;
  isFacilitator: boolean;
  phase: RetroPhase;
  title: string;
}

export type ActionStatus = 'OPEN' | 'DONE' | 'DROPPED';

export interface Action {
  assignee?: {id: string; name: string};
  createdAt?: string;
  id: string;
  /** Both absent once the originating retro is deleted: actions outlive their retro. */
  retroId?: string;
  retroTitle?: string;
  status: ActionStatus;
  text: string;
}

export type TimerState = 'IDLE' | 'RUNNING' | 'PAUSED';

export interface Timer {
  endsAt?: string;
  /** What is left: frozen while paused, measured by the service at send time while running. */
  remainingMs?: number;
  /** How long the round was set to run, so the bar knows how much of it is left. */
  totalMs?: number;
  state: TimerState;
}

export type TimerAction = 'start' | 'pause' | 'resume' | 'extend' | 'stop';

export interface TeamRetroSummary extends RetroSummary {
  teamId: string;
  teamName: string;
}

export interface Board extends RetroSummary {
  actions: Action[];
  carriedOverActions: Action[];
  columns: Column[];
  maxVotes: number;
  myNotesRevealed: boolean;
  myVotesLeft: number;
  teamId: string;
  timer: Timer;
  votesRevealed: boolean;
}

export interface Participant {
  name: string;
  pictureUrl?: string;
  userId: string;
}

/** Board-relative, as a fraction of its box: every screen is a different size. */
export interface Cursor {
  name: string;
  userId: string;
  x: number;
  y: number;
}

export type ServerEvent =
  | {board: Board; type: 'board.updated'}
  | {cursor: Cursor; type: 'cursor.moved'}
  | {message: string; type: 'error'}
  | {participants: Participant[]; type: 'presence.updated'}
  | {type: 'cursor.left'; userId: string};

export interface OrgMemberTeam {
  id: string;
  isAdmin: boolean;
  name: string;
}

export interface OrgMember extends User {
  teams: OrgMemberTeam[];
}

export type OrgRole = 'member' | 'admin';

export interface Invitation {
  createdAt: string;
  email: string;
  expiresAt: string;
  id: string;
  role: OrgRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
}

export type StatsPeriod = '30d' | '90d' | 'all';

/** Counters only: an org administrator never reads what a team wrote, nor who wrote it. */
export interface OrgStats {
  /** Created within the period; `status` is where they stand today. */
  actions: {done: number; dropped: number; open: number};
  /** `perRetro` divides by the retros of the period, 0 when there was none. */
  notes: {count: number; perRetro: number};
  people: {admins: number; total: number};
  period: StatsPeriod;
  /** `count` within the period, `total` since the start. */
  retros: {count: number; total: number};
  /** `idle`: no retro started in the last 30 days, whatever the period. */
  teams: {idle: number; total: number};
}

export interface OrgSummary {
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

export interface PublicConfig {
  appName: string;
  devLoginEnabled: boolean;
  googleClientId: string;
  mailEnabled: boolean;
  setupRequired: boolean;
}
