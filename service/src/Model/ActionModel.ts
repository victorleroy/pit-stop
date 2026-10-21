import type {ActionStatus} from '~/Db/schema';

export interface ActionAssigneeModel {
  id: string;
  name: string;
}

export interface ActionModel {
  assignee?: ActionAssigneeModel;
  createdAt?: string;
  id: string;
  /** Absent once the originating retro has been deleted: actions outlive their retro. */
  retroId?: string;
  retroTitle?: string;
  status: ActionStatus;
  text: string;
}
