import {v4 as uuid} from 'uuid';
import {config} from '~/config';
import type {Db} from '~/Db/connection';
import type {OrgStatus} from '~/Db/schema';
import {ConflictHttpError, ForbiddenHttpError, NotFoundHttpError} from '~/Error/HttpError';
import type {InvitationManager} from '~/Manager/InvitationManager';
import type {InvitationModel} from '~/Model/UserModel';
import type {OrgSummaryModel} from '~/Model/OrgModel';
import type {OrgRepository} from '~/Repository/OrgRepository';
import type {SessionRepository} from '~/Repository/SessionRepository';
import type {AuthContext} from '~/Security/AuthContext';

/**
 * The paddock (ADR D8).
 *
 * It sees organisations, counters and last activity. It does NOT see note text, votes or note
 * authorship, and there is deliberately no impersonation: an operator who can read a retro's
 * stickies destroys the product's central promise.
 *
 * The honest scope of that guarantee: the product offers the operator no way to read a board,
 * and no paddock action grants board access. It is not a claim that the operator *cannot*
 * read the data, since they hold the deploy and the database file. What it buys is that
 * reading a board is never a supported operation, never an accident, and never something a
 * support request can quietly turn into.
 *
 * This class is the documented escape hatch from ScopedDb, so it is the one place where
 * tenant isolation is a discipline rather than a property of the type. Every query added here
 * must stay on counters and metadata.
 */
export class PlatformManager {
  public constructor(
    private readonly db: Db,
    private readonly orgRepository: OrgRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly invitationManager: InvitationManager,
  ) {}

  public static check(auth: AuthContext): void {
    if (!auth.isPlatformAdmin) {
      throw new ForbiddenHttpError('Reserved to the platform administrator');
    }
  }

  public async listOrganizations(auth: AuthContext): Promise<OrgSummaryModel[]> {
    PlatformManager.check(auth);

    const orgs = await this.orgRepository.findAll();

    return Promise.all(orgs.map((org) => this.summarize(org.id, org.name, org.status, org.createdAt)));
  }

  public async createOrganization(
    auth: AuthContext,
    name: string,
    adminEmail: string,
    domain?: string,
  ): Promise<{invitation: InvitationModel; orgId: string}> {
    PlatformManager.check(auth);

    const orgId = `org_${uuid()}`;

    if (domain) {
      await this.checkDomainFree(orgId, domain);
    }

    // The cloud starts every organisation on the demo tier (ADR D13); the self-hosted edition
    // has no tiers to start on (ADR-002 D3).
    await this.orgRepository.create({
      id: orgId,
      name,
      status: config.edition === 'cloud' ? 'demo' : 'active',
    });

    if (domain) {
      await this.orgRepository.addDomain(orgId, domain);
    }

    try {
      const invitation = await this.invitationManager.issue({
        email: adminEmail,
        invitedBy: auth.userId,
        inviterName: auth.name,
        orgId,
        role: 'admin',
      });

      return {invitation, orgId};
    } catch (error: unknown) {
      // An organisation nobody can administer must not linger, nor keep its domain claimed:
      // the domains go with it, by cascade.
      await this.orgRepository.remove(orgId);
      throw error;
    }
  }

  public async setStatus(auth: AuthContext, orgId: string, status: OrgStatus): Promise<void> {
    PlatformManager.check(auth);

    const org = await this.orgRepository.findOneById(orgId);

    if (!org) {
      throw new NotFoundHttpError(`Organisation "${orgId}" not found`);
    }

    await this.orgRepository.setStatus(orgId, status);

    // A suspension has to cut live sessions too, not just new logins (ADR D7).
    if (status === 'suspended') {
      const members = await this.orgRepository.listMembers(orgId);

      await Promise.all(
        members.map((member) => this.sessionRepository.revokeAllForUser(member.userId)),
      );
    }
  }

  public async setDomainVerified(
    auth: AuthContext,
    orgId: string,
    domain: string,
    verified: boolean,
  ): Promise<void> {
    PlatformManager.check(auth);

    const org = await this.orgRepository.findOneById(orgId);

    if (!org) {
      throw new NotFoundHttpError(`Organisation "${orgId}" not found`);
    }

    await this.checkDomainFree(orgId, domain);

    await this.orgRepository.addDomain(orgId, domain);
    await this.orgRepository.setDomainVerified(domain, verified);
  }

  /** Releasing a domain, which is the only way to move one between organisations. */
  public async removeDomain(auth: AuthContext, orgId: string, domain: string): Promise<void> {
    PlatformManager.check(auth);

    await this.orgRepository.removeDomain(orgId, domain);
  }

  /**
   * A verified domain lets anybody with an address on it join the organisation, so claiming
   * one that already belongs elsewhere would redirect that customer's sign-ups. A mistyped
   * domain in the paddock is all it would take, which is why this refuses rather than warns.
   */
  private async checkDomainFree(orgId: string, domain: string): Promise<void> {
    const owner = await this.orgRepository.findOrgByDomain(domain);

    if (owner && owner !== orgId) {
      throw new ConflictHttpError(
        `Domain "${domain}" already belongs to another organisation, release it there first`,
      );
    }
  }

  /** Counters and dates only: never a note, a vote or an author. */
  private async summarize(
    orgId: string,
    name: string,
    status: OrgStatus,
    createdAt: string,
  ): Promise<OrgSummaryModel> {
    const [memberCount, teamCount, retros, domains] = await Promise.all([
      this.orgRepository.countMembers(orgId),
      this.db
        .selectFrom('teams')
        .select((eb) => eb.fn.countAll<number>().as('total'))
        .where('orgId', '=', orgId)
        .executeTakeFirst(),
      this.db
        .selectFrom('retros')
        .select((eb) => [
          eb.fn.countAll<number>().as('total'),
          eb.fn.max<string>('createdAt').as('lastActivityAt'),
        ])
        .where('orgId', '=', orgId)
        .executeTakeFirst(),
      this.orgRepository.listDomains(orgId),
    ]);

    return {
      createdAt,
      domains: domains.map(({domain, verifiedAt}) => ({domain, verified: Boolean(verifiedAt)})),
      id: orgId,
      ...(retros?.lastActivityAt ? {lastActivityAt: retros.lastActivityAt} : {}),
      memberCount,
      name,
      retroCount: Number(retros?.total ?? 0),
      status,
      teamCount: Number(teamCount?.total ?? 0),
    };
  }
}
