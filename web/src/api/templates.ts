import {request} from '@/api/client';
import type {Template, TemplateInput, TeamTemplates} from '@/api/types';

export const MAX_TEMPLATE_COLUMNS = 8;
export const MAX_TEAM_TEMPLATES = 50;

export const teamTemplatesKey = (teamId: string) => ['teams', teamId, 'templates'] as const;

export const fetchTeamTemplates = (teamId: string) =>
  request<TeamTemplates>(`/teams/${teamId}/templates`);

export const createTemplate = (teamId: string, input: TemplateInput) =>
  request<Template>(`/teams/${teamId}/templates`, {body: input, method: 'POST'});

// The source is a builtin:*, or a template of a team the caller belongs to.
export const duplicateTemplate = (teamId: string, sourceTemplateId: string, name?: string) =>
  request<Template>(`/teams/${teamId}/templates/duplicate`, {
    body: {name, sourceTemplateId},
    method: 'POST',
  });

export const updateTemplate = (teamId: string, templateId: string, input: TemplateInput) =>
  request<Template>(`/teams/${teamId}/templates/${templateId}`, {body: input, method: 'PUT'});

export const deleteTemplate = (teamId: string, templateId: string) =>
  request<void>(`/teams/${teamId}/templates/${templateId}`, {method: 'DELETE'});

export const saveRetroAsTemplate = (
  retroId: string,
  input: {description?: string | null; name: string},
) => request<Template>(`/retros/${retroId}/template`, {body: input, method: 'POST'});

// null goes back to Start / Stop / Continue.
export const setDefaultTemplate = (teamId: string, templateId: string | null) =>
  request<{defaultTemplateId: string}>(`/teams/${teamId}/default-template`, {
    body: {templateId},
    method: 'PUT',
  });
