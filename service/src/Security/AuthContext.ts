import type {OrgStatus} from '~/Db/schema';
import type {ScopedDb} from '~/Security/ScopedDb';

/**
 * Everything the request layer resolved from the session. Roles and org membership are read
 * from the store on every request (ADR D7), never carried in the token, so a demotion or a
 * suspension takes effect immediately.
 */
export interface AuthContext {
  db: ScopedDb;
  email: string;
  isPlatformAdmin: boolean;
  name: string;
  orgId: string;
  orgStatus: OrgStatus;
  pictureUrl?: string;
  userId: string;
}
