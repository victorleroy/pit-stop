import {request} from '@/api/client';
import type {OrgMember, Team, TeamMember, TeamSummary, User} from '@/api/types';

export const fetchTeams = () => request<Team[]>('/teams');

export const createTeam = (name: string) =>
  request<Team>('/teams', {body: {name}, method: 'POST'});

export const renameTeam = (teamId: string, name: string) =>
  request<Team>(`/teams/${teamId}`, {body: {name}, method: 'PATCH'});

// Org administrators only: everything the team held goes with it.
export const deleteTeam = (teamId: string) =>
  request<void>(`/teams/${teamId}`, {method: 'DELETE'});

// Counters only, for the delete confirmation: what would be lost, never what it says.
export const fetchTeamSummary = (teamId: string) =>
  request<TeamSummary>(`/teams/${teamId}/summary`);

export const leaveTeam = (teamId: string) =>
  request<void>(`/teams/${teamId}/members/me`, {method: 'DELETE'});

export const addTeamMember = (teamId: string, userId: string) =>
  request<void>(`/teams/${teamId}/members`, {body: {userId}, method: 'POST'});

export const removeTeamMember = (teamId: string, userId: string) =>
  request<void>(`/teams/${teamId}/members/${userId}`, {method: 'DELETE'});

export const fetchTeamMembers = (teamId: string) =>
  request<TeamMember[]>(`/teams/${teamId}/members`);

export const setTeamAdmin = (teamId: string, userId: string, isAdmin: boolean) =>
  request<void>(`/teams/${teamId}/members/${userId}/admin`, {body: {isAdmin}, method: 'PUT'});

export const fetchOrgAdmins = () => request<User[]>('/org/admins');

export const setOrgAdmin = (userId: string, isAdmin: boolean) =>
  request<void>(`/org/admins/${userId}`, {body: {isAdmin}, method: 'PUT'});

export const fetchOrgMembers = () => request<OrgMember[]>('/org/members');
