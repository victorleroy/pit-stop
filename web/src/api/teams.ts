import {request} from '@/api/client';
import type {OrgMember, Team, TeamMember, User} from '@/api/types';

export const fetchTeams = () => request<Team[]>('/teams');

export const createTeam = (name: string) =>
  request<Team>('/teams', {body: {name}, method: 'POST'});

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
