export interface TeamModel {
  createdAt?: string;
  createdBy: string;
  id: string;
  isAdmin: boolean;
  isMember: boolean;
  memberCount: number;
  name: string;
}

export interface TeamMemberModel {
  email: string;
  isAdmin: boolean;
  joinedAt?: string;
  name: string;
  pictureUrl?: string;
  userId: string;
}

/** What deleting a team would take with it. Counters only. */
export interface TeamSummaryModel {
  actionCount: number;
  retroCount: number;
}
