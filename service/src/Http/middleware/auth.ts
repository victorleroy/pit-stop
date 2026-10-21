import type {Context, Next} from 'hono';
import {UnauthorizedHttpError} from '~/Error/HttpError';
import type {AuthManager} from '~/Manager/AuthManager';
import type {AuthContext} from '~/Security/AuthContext';

export interface Variables {
  auth: AuthContext;
  token: string;
}

export const bearerOf = (context: Context): string | undefined => {
  const header = context.req.header('authorization') ?? context.req.header('Authorization');

  if (!header?.toLowerCase().startsWith('bearer ')) {
    return undefined;
  }

  return header.slice('bearer '.length).trim();
};

/**
 * Resolves the opaque session on every request (ADR D7). Roles, organisation membership and
 * organisation status are read from the store here, never from a token claim, so a demotion
 * or a suspension takes effect on the very next request.
 */
export const requireAuth = (authManager: AuthManager) => async (context: Context, next: Next) => {
  const token = bearerOf(context);

  if (!token) {
    throw new UnauthorizedHttpError('Missing Authorization bearer token');
  }

  const auth = await authManager.resolveSession(token);

  if (!auth) {
    throw new UnauthorizedHttpError('Invalid or expired session');
  }

  context.set('auth', auth);
  context.set('token', token);

  await next();
};
