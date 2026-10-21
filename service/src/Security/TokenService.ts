import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';

/**
 * Opaque tokens for sessions, invitations and password resets (ADR D7, D12).
 * The plain value only ever exists in the response or the email link; the database keeps a
 * hash, exactly like a password, so a dump does not hand out live tokens.
 */
export const TokenService = {
  generate(): string {
    return randomBytes(32).toString('base64url');
  },

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  },

  equals(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);

    return a.length === b.length && timingSafeEqual(a, b);
  },
};
