import {request} from '@/api/client';
import type {Invitation, OrgStatus, OrgSummary} from '@/api/types';

/**
 * The paddock. Counters and status only: there is no endpoint here that reads a note, a
 * vote or a note's author, and none that impersonates anybody.
 */
export const fetchOrganizations = () => request<OrgSummary[]>('/paddock/organizations');

export const createOrganization = (name: string, adminEmail: string, domain?: string) =>
  request<{invitation: Invitation; orgId: string}>('/paddock/organizations', {
    body: {adminEmail, domain, name},
    method: 'POST',
  });

export const setOrgStatus = (orgId: string, status: OrgStatus) =>
  request<void>(`/paddock/organizations/${orgId}/status`, {body: {status}, method: 'PUT'});

export const setDomainVerified = (orgId: string, domain: string, verified: boolean) =>
  request<void>(`/paddock/organizations/${orgId}/domains`, {
    body: {domain, verified},
    method: 'PUT',
  });
