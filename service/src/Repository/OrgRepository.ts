import type {Db} from '~/Db/connection';
import type {OrgRole, OrgStatus} from '~/Db/schema';

export interface OrgRow {
  createdAt: string;
  id: string;
  name: string;
  status: OrgStatus;
}

export interface OrgMemberRow {
  createdAt: string;
  email: string;
  name: string;
  pictureUrl: string | null;
  role: OrgRole;
  userId: string;
}

export class OrgRepository {
  public constructor(private readonly db: Db) {}

  public async findOneById(orgId: string): Promise<OrgRow | undefined> {
    return this.db
      .selectFrom('organizations')
      .selectAll()
      .where('id', '=', orgId)
      .executeTakeFirst();
  }

  public async findAll(): Promise<OrgRow[]> {
    return this.db.selectFrom('organizations').selectAll().orderBy('name').execute();
  }

  public async create(input: {id: string; name: string; status?: OrgStatus}): Promise<void> {
    await this.db
      .insertInto('organizations')
      .values({
        createdAt: new Date().toISOString(),
        id: input.id,
        name: input.name,
        status: input.status ?? 'demo',
      })
      .execute();
  }

  public async remove(orgId: string): Promise<void> {
    await this.db.deleteFrom('organizations').where('id', '=', orgId).execute();
  }

  public async count(): Promise<number> {
    const row = await this.db
      .selectFrom('organizations')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }

  public async setStatus(orgId: string, status: OrgStatus): Promise<void> {
    await this.db
      .updateTable('organizations')
      .set({status})
      .where('id', '=', orgId)
      .execute();
  }

  /** Auto-join only ever applies to a verified domain (ADR-001 D5, D12). */
  public async findOrgByVerifiedDomain(domain: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('orgDomains')
      .select('orgId')
      .where('domain', '=', domain.toLowerCase())
      .where('verifiedAt', 'is not', null)
      .executeTakeFirst();

    return row?.orgId;
  }

  /**
   * Any organisation claiming this domain, verified or not. Used to make sure a second
   * organisation is never invented for a domain somebody already owns.
   */
  public async findOrgByDomain(domain: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('orgDomains')
      .select('orgId')
      .where('domain', '=', domain.toLowerCase())
      .executeTakeFirst();

    return row?.orgId;
  }

  public async listDomains(orgId: string) {
    return this.db
      .selectFrom('orgDomains')
      .select(['domain', 'verifiedAt'])
      .where('orgId', '=', orgId)
      .execute();
  }

  /**
   * Claiming a domain never reassigns it: a domain already claimed by another organisation
   * keeps its owner, and the caller is expected to have refused the request before getting
   * here. Reassigning on conflict would silently redirect a customer's future sign-ups to
   * whichever organisation claimed the domain last.
   */
  public async addDomain(orgId: string, domain: string): Promise<void> {
    await this.db
      .insertInto('orgDomains')
      .values({domain: domain.toLowerCase(), orgId, verifiedAt: null})
      .onConflict((oc) => oc.column('domain').doNothing())
      .execute();
  }

  public async removeDomain(orgId: string, domain: string): Promise<void> {
    await this.db
      .deleteFrom('orgDomains')
      .where('domain', '=', domain.toLowerCase())
      .where('orgId', '=', orgId)
      .execute();
  }

  public async setDomainVerified(domain: string, verified: boolean): Promise<void> {
    await this.db
      .updateTable('orgDomains')
      .set({verifiedAt: verified ? new Date().toISOString() : null})
      .where('domain', '=', domain.toLowerCase())
      .execute();
  }

  public async findMembership(userId: string): Promise<{orgId: string; role: OrgRole} | undefined> {
    return this.db
      .selectFrom('orgMembers')
      .select(['orgId', 'role'])
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  public async addMember(orgId: string, userId: string, role: OrgRole): Promise<void> {
    await this.db
      .insertInto('orgMembers')
      .values({createdAt: new Date().toISOString(), orgId, role, userId})
      .onConflict((oc) => oc.columns(['orgId', 'userId']).doUpdateSet({role}))
      .execute();
  }

  public async listMembers(orgId: string): Promise<OrgMemberRow[]> {
    return this.db
      .selectFrom('orgMembers')
      .innerJoin('users', 'users.id', 'orgMembers.userId')
      .select([
        'orgMembers.userId',
        'orgMembers.role',
        'orgMembers.createdAt',
        'users.email',
        'users.name',
        'users.pictureUrl',
      ])
      .where('orgMembers.orgId', '=', orgId)
      .orderBy('users.name')
      .execute();
  }

  public async countAdmins(orgId: string): Promise<number> {
    const row = await this.db
      .selectFrom('orgMembers')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('orgId', '=', orgId)
      .where('role', '=', 'admin')
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }

  public async countMembers(orgId: string): Promise<number> {
    const row = await this.db
      .selectFrom('orgMembers')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('orgId', '=', orgId)
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }
}
