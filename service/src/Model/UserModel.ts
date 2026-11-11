import type {AvatarSource, NameSource, OrgRole, OrgStatus} from '~/Db/schema';

export interface UserModel {
  email: string;
  id: string;
  isOrgAdmin?: boolean;
  /** Platform admin is derived from configuration, never stored (ADR-001 D8). */
  isPlatformAdmin?: boolean;
  name: string;
  orgId: string;
  orgName?: string;
  orgStatus?: OrgStatus;
  pictureUrl?: string;
}

/** What the profile page needs on top: where the name and the picture come from. */
export interface ProfileModel extends UserModel {
  avatarSource: AvatarSource;
  /** To offer "Use my Google name". */
  hasSsoName: boolean;
  nameSource: NameSource;
  /** To offer "Use my Google photo". */
  ssoPictureUrl?: string;
}

export interface AuthResponseModel {
  token: string;
  user: UserModel;
}

export interface OrgMemberTeamModel {
  id: string;
  isAdmin: boolean;
  name: string;
}

export interface OrgMemberModel extends UserModel {
  teams: OrgMemberTeamModel[];
}

export interface InvitationModel {
  createdAt: string;
  email: string;
  expiresAt: string;
  id: string;
  role: OrgRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
}
