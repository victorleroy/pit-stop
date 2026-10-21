import {randomUUID} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createContainer} from '~/container';
import type {Container} from '~/container';
import {migrate} from '~/Db/migrate';
import type {OrgRole} from '~/Db/schema';
import type {AuthResponseModel} from '~/Model/UserModel';
import type {AuthContext} from '~/Security/AuthContext';
import {ScopedDb} from '~/Security/ScopedDb';

/**
 * Tests run the real Managers against a real SQLite file, not against mocked repositories.
 *
 * A throwaway SQLite database is instantaneous, so there is nothing to buy by mocking the
 * store: the same tests cover the managers and the SQL underneath them.
 */
export class Harness {
  private readonly directory: string;

  public readonly container: Container;

  private constructor() {
    this.directory = mkdtempSync(join(tmpdir(), 'pit-stop-test-'));

    const file = join(this.directory, 'test.db');

    migrate(file);
    this.container = createContainer(file);
  }

  public static create(): Harness {
    return new Harness();
  }

  public async destroy(): Promise<void> {
    await this.container.db.destroy();
    rmSync(this.directory, {force: true, recursive: true});
  }

  public async createOrg(name = 'Acme'): Promise<string> {
    const id = `org_${randomUUID()}`;

    await this.container.db
      .insertInto('organizations')
      .values({createdAt: new Date().toISOString(), id, name, status: 'active'})
      .execute();

    return id;
  }

  public async createUser(
    orgId: string,
    name: string,
    role: OrgRole = 'member',
  ): Promise<AuthContext> {
    const id = `usr_${randomUUID()}`;
    const email = `${name.toLowerCase()}@acme.test`;
    const now = new Date().toISOString();

    await this.container.db
      .insertInto('users')
      .values({createdAt: now, email, emailVerifiedAt: now, id, name, pictureUrl: null})
      .execute();

    await this.container.db
      .insertInto('orgMembers')
      .values({createdAt: now, orgId, role, userId: id})
      .execute();

    return {
      db: new ScopedDb(this.container.db, orgId),
      email,
      isPlatformAdmin: false,
      name,
      orgId,
      orgStatus: 'active',
      userId: id,
    };
  }

  /** Registers by verified domain, then opens the link the confirmation email carried. */
  public async registerAndConfirm(input: {
    email: string;
    name: string;
    password: string;
  }): Promise<AuthResponseModel> {
    const send = jest.spyOn(this.container.mailer, 'send');

    try {
      await this.container.authManager.register({email: input.email, name: input.name});

      const link = send.mock.calls.at(-1)?.[0].link ?? '';

      return await this.container.authManager.verifyEmail(
        link.split('/').pop() ?? '',
        input.password,
      );
    } finally {
      send.mockRestore();
    }
  }

  /** A team plus its members, the starting point of almost every scenario. */
  public async createTeam(owner: AuthContext, members: AuthContext[] = []): Promise<string> {
    const team = await this.container.teamManager.createTeam(owner, 'Platform');

    // The owner adds them: there is no self-service join.
    for (const member of members) {
      await this.container.teamManager.addMember(owner, team.id, member.userId);
    }

    return team.id;
  }
}
