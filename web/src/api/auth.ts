import {request} from '@/api/client';
import type {AuthResponse, PublicConfig, User} from '@/api/types';

export const fetchPublicConfig = () => request<PublicConfig>('/config');

export const loginWithGoogle = (idToken: string) =>
  request<AuthResponse>('/auth/google', {body: {idToken}, method: 'POST'});

export const loginWithPassword = (email: string, password: string) =>
  request<AuthResponse>('/auth/login', {body: {email, password}, method: 'POST'});

/**
 * No session and no password yet: the account opens from the confirmation link sent to the
 * address, where whoever holds the mailbox chooses the password.
 */
export const register = (email: string, name: string) =>
  request<void>('/auth/register', {body: {email, name}, method: 'POST'});

export const verifyEmail = (token: string, password: string) =>
  request<AuthResponse>('/auth/verify-email', {body: {password, token}, method: 'POST'});

export const loginAsDev = (email: string, name?: string) =>
  request<AuthResponse>('/auth/dev-login', {body: {email, name}, method: 'POST'});

/** First boot only: the token is the one printed in the service logs. */
export const setupInstance = (input: {
  email: string;
  name: string;
  orgName: string;
  password: string;
  token: string;
}) => request<AuthResponse>('/setup', {body: input, method: 'POST'});

export const logout = () => request<void>('/auth/logout', {method: 'POST'});

/**
 * Accepting an invitation creates the account when there is none, and signs it in: the token
 * proves control of the mailbox, so there is no separate verification step on this path.
 * Signed in already, it only adds the membership and answers nothing.
 */
export const acceptInvitation = (token: string, name?: string, password?: string) =>
  request<AuthResponse | undefined>('/auth/invitations/accept', {
    body: {name, password, token},
    method: 'POST',
  });

export const requestPasswordReset = (email: string) =>
  request<void>('/auth/password-reset', {body: {email}, method: 'POST'});

export const confirmPasswordReset = (token: string, password: string) =>
  request<void>('/auth/password-reset', {body: {password, token}, method: 'PUT'});

export const fetchMe = () => request<User>('/me');
