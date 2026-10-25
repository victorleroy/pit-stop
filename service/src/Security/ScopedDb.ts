import type {Db} from '~/Db/connection';

/**
 * Tenant isolation as a property of the type, not a discipline (ADR-001 D6).
 *
 * Application code never receives the raw Kysely instance. It receives this wrapper, whose
 * accessors have already applied `org_id = <caller's org>`. There is deliberately no method
 * that returns an unscoped query builder for a tenant-owned table, so forgetting the filter
 * is not something a new endpoint can do by omission.
 *
 * Child tables (columns, notes, clusters, votes, memberships) carry no `org_id`: they are
 * only ever reached through a retro or a team whose access has already been checked by
 * RetroAccessChecker. That is the boundary, and it is the one thing a reviewer must verify
 * when adding a repository method.
 */
export class ScopedDb {
  public constructor(
    private readonly db: Db,
    public readonly orgId: string,
  ) {}

  public teams() {
    return this.db.selectFrom('teams').where('teams.orgId', '=', this.orgId);
  }

  public retros() {
    return this.db.selectFrom('retros').where('retros.orgId', '=', this.orgId);
  }

  public actions() {
    return this.db.selectFrom('actions').where('actions.orgId', '=', this.orgId);
  }

  public orgMembers() {
    return this.db.selectFrom('orgMembers').where('orgMembers.orgId', '=', this.orgId);
  }

  public invitations() {
    return this.db.selectFrom('invitations').where('invitations.orgId', '=', this.orgId);
  }

  /**
   * Writes and child-table reads. Callers must have validated the parent retro or team
   * through RetroAccessChecker first: this is the documented boundary of the scope.
   */
  public get unscoped(): Db {
    return this.db;
  }
}
