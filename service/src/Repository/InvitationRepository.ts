import type {Db} from '~/Db/connection';
import type {OrgRole} from '~/Db/schema';

export interface InvitationRow {
  acceptedAt: string | null;
  createdAt: string;
  email: string;
  expiresAt: string;
  id: string;
  invitedBy: string | null;
  orgId: string;
  revokedAt: string | null;
  role: OrgRole;
}

export class InvitationRepository {
  public constructor(private readonly db: Db) {}

  public async create(input: {
    email: string;
    expiresAt: string;
    id: string;
    invitedBy: string;
    orgId: string;
    role: OrgRole;
    tokenHash: string;
  }): Promise<void> {
    await this.db
      .insertInto('invitations')
      .values({
        acceptedAt: null,
        createdAt: new Date().toISOString(),
        email: input.email.toLowerCase(),
        expiresAt: input.expiresAt,
        id: input.id,
        invitedBy: input.invitedBy,
        orgId: input.orgId,
        revokedAt: null,
        role: input.role,
        tokenHash: input.tokenHash,
      })
      .execute();
  }

  /** Looked up by hash: the plain token only ever exists in the email link. */
  public async findByTokenHash(tokenHash: string): Promise<InvitationRow | undefined> {
    return this.db
      .selectFrom('invitations')
      .selectAll()
      .where('tokenHash', '=', tokenHash)
      .executeTakeFirst();
  }

  public async markAccepted(id: string): Promise<void> {
    await this.db
      .updateTable('invitations')
      .set({acceptedAt: new Date().toISOString()})
      .where('id', '=', id)
      .where('acceptedAt', 'is', null)
      .execute();
  }

  public async remove(id: string): Promise<void> {
    await this.db.deleteFrom('invitations').where('id', '=', id).execute();
  }

  public async revoke(id: string): Promise<void> {
    await this.db
      .updateTable('invitations')
      .set({revokedAt: new Date().toISOString()})
      .where('id', '=', id)
      .execute();
  }

  public async listByOrg(orgId: string): Promise<InvitationRow[]> {
    return this.db
      .selectFrom('invitations')
      .selectAll()
      .where('orgId', '=', orgId)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  /** Feeds the per-organisation daily quota that protects the email allowance (ADR-001 D12, D13). */
  public async countSince(orgId: string, since: string): Promise<number> {
    const row = await this.db
      .selectFrom('invitations')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('orgId', '=', orgId)
      .where('createdAt', '>=', since)
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }
}
