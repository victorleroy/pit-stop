import type {ActionReviewOutcome, ActionStatus} from '~/Db/schema';

export interface ActionAssigneeModel {
  id: string;
  name: string;
}

export interface ActionModel {
  assignee?: ActionAssigneeModel;
  /** When it was last closed; null while open, and for actions closed before it was recorded. */
  closedAt: string | null;
  createdAt?: string;
  id: string;
  /** Absent once the originating retro has been deleted: actions outlive their retro. */
  retroId?: string;
  retroTitle?: string;
  status: ActionStatus;
  text: string;
}

export interface ReviewerModel {
  id: string;
  name: string;
  pictureUrl?: string;
}

/** An action to review in a retro, with the outcome recorded in that retro if any. */
export interface ReviewItemModel {
  action: ActionModel;
  comment?: string;
  outcome?: ActionReviewOutcome;
  reviewedAt?: string;
  reviewedBy?: ReviewerModel;
}

export interface ReviewModel {
  /** Always true until the review can be turned off per retro. */
  enabled: boolean;
  /** Always null until the review phase exists. */
  focusActionId: string | null;
  items: ReviewItemModel[];
}

export interface TrendPointModel {
  createdAt: string;
  current: boolean;
  done: number;
  dropped: number;
  kept: number;
  rate: number | null;
  retroId: string;
  retroTitle: string;
}

export interface ActionStatsModel {
  completionTrend: TrendPointModel[];
  doneSinceLastRetro: number;
  droppedSinceLastRetro: number;
  openCount: number;
}
