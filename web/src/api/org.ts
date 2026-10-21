import {request} from '@/api/client';
import type {Invitation, OrgRole} from '@/api/types';

export const fetchInvitations = () => request<Invitation[]>('/org/invitations');

export const inviteToOrg = (email: string, role: OrgRole) =>
  request<Invitation>('/org/invitations', {body: {email, role}, method: 'POST'});

export const revokeInvitation = (invitationId: string) =>
  request<void>(`/org/invitations/${invitationId}`, {method: 'DELETE'});
