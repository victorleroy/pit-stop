import {request} from '@/api/client';
import type {
  Action,
  ActionStatus,
  Board,
  RetroPhase,
  RetroSummary,
  TeamRetroSummary,
  TimerAction,
} from '@/api/types';

export const fetchRetros = (teamId: string) =>
  request<RetroSummary[]>(`/teams/${teamId}/retros`);

export const fetchMyRetros = () => request<TeamRetroSummary[]>('/me/retros');

export const createRetro = (teamId: string, title: string, columns?: string[]) =>
  request<Board>(`/teams/${teamId}/retros`, {body: {columns, title}, method: 'POST'});

export const fetchBoard = (retroId: string) => request<Board>(`/retros/${retroId}`);

export const updateRetro = (
  retroId: string,
  changes: {
    phase?: RetroPhase;
    timer?: {action: TimerAction; seconds?: number};
    title?: string;
  },
) => request<Board>(`/retros/${retroId}`, {body: changes, method: 'PATCH'});

export const addColumn = (retroId: string, title: string) =>
  request<Board>(`/retros/${retroId}/columns`, {body: {title}, method: 'POST'});

export const renameColumn = (retroId: string, columnId: string, title: string) =>
  request<Board>(`/retros/${retroId}/columns/${columnId}`, {body: {title}, method: 'PATCH'});

export const removeColumn = (retroId: string, columnId: string) =>
  request<Board>(`/retros/${retroId}/columns/${columnId}`, {method: 'DELETE'});

export const createNote = (retroId: string, columnId: string, text: string) =>
  request<Board>(`/retros/${retroId}/notes`, {body: {columnId, text}, method: 'POST'});

export const updateNote = (
  retroId: string,
  noteId: string,
  changes: {columnId?: string; text?: string},
) => request<Board>(`/retros/${retroId}/notes/${noteId}`, {body: changes, method: 'PATCH'});

export const removeNote = (retroId: string, noteId: string) =>
  request<Board>(`/retros/${retroId}/notes/${noteId}`, {method: 'DELETE'});

export const revealMyNotes = (retroId: string) =>
  request<Board>(`/retros/${retroId}/notes/reveal`, {method: 'POST'});

export const hideMyNotes = (retroId: string) =>
  request<Board>(`/retros/${retroId}/notes/reveal`, {method: 'DELETE'});

export const groupNote = (retroId: string, noteId: string, targetId: string) =>
  request<Board>(`/retros/${retroId}/notes/${noteId}/group`, {
    body: {targetId},
    method: 'POST',
  });

export const ungroupNote = (retroId: string, noteId: string) =>
  request<Board>(`/retros/${retroId}/notes/${noteId}/group`, {method: 'DELETE'});

export const renameCluster = (retroId: string, clusterId: string, title: string) =>
  request<Board>(`/retros/${retroId}/clusters/${clusterId}`, {body: {title}, method: 'PATCH'});

export const castVote = (retroId: string, targetId: string, delta: 1 | -1) =>
  request<Board>(`/retros/${retroId}/votes`, {body: {delta, targetId}, method: 'POST'});

export const fetchActions = (teamId: string) => request<Action[]>(`/teams/${teamId}/actions`);

export const createAction = (retroId: string, text: string, assigneeId?: string) =>
  request<Action>(`/retros/${retroId}/actions`, {body: {assigneeId, text}, method: 'POST'});

export const updateAction = (
  teamId: string,
  actionId: string,
  changes: {assigneeId?: string | null; status?: ActionStatus; text?: string},
) => request<Action>(`/teams/${teamId}/actions/${actionId}`, {body: changes, method: 'PATCH'});

export const removeRetro = (retroId: string) =>
  request<void>(`/retros/${retroId}`, {method: 'DELETE'});

export const takeFacilitation = (retroId: string) =>
  request<void>(`/retros/${retroId}/facilitator`, {method: 'POST'});

export const handOverFacilitation = (retroId: string, userId: string) =>
  request<void>(`/retros/${retroId}/facilitator`, {body: {userId}, method: 'PUT'});
