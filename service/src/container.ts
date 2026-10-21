import {config} from '~/config';
import {GoogleClient} from '~/Client/GoogleClient';
import {createDb} from '~/Db/connection';
import type {Db} from '~/Db/connection';
import {createMailer} from '~/Mail/Mailer';
import type {Mailer} from '~/Mail/Mailer';
import {ActionManager} from '~/Manager/ActionManager';
import {AdminManager} from '~/Manager/AdminManager';
import {AuthManager} from '~/Manager/AuthManager';
import {ClusterManager} from '~/Manager/ClusterManager';
import {InvitationManager} from '~/Manager/InvitationManager';
import {NoteManager} from '~/Manager/NoteManager';
import {PasswordResetManager} from '~/Manager/PasswordResetManager';
import {PlatformManager} from '~/Manager/PlatformManager';
import {RetroManager} from '~/Manager/RetroManager';
import {SetupManager} from '~/Manager/SetupManager';
import {TeamManager} from '~/Manager/TeamManager';
import {VoteManager} from '~/Manager/VoteManager';
import {SessionHub} from '~/Realtime/SessionHub';
import {ActionRepository} from '~/Repository/ActionRepository';
import {BoardRepository} from '~/Repository/BoardRepository';
import {ClusterRepository} from '~/Repository/ClusterRepository';
import {ColumnRepository} from '~/Repository/ColumnRepository';
import {InvitationRepository} from '~/Repository/InvitationRepository';
import {MembershipRepository} from '~/Repository/MembershipRepository';
import {NoteRepository} from '~/Repository/NoteRepository';
import {OrgRepository} from '~/Repository/OrgRepository';
import {RetroRepository} from '~/Repository/RetroRepository';
import {SessionRepository} from '~/Repository/SessionRepository';
import {TeamRepository} from '~/Repository/TeamRepository';
import {UserRepository} from '~/Repository/UserRepository';
import {VoteRepository} from '~/Repository/VoteRepository';
import {RetroAccessChecker} from '~/Security/RetroAccessChecker';
import {RoleChecker} from '~/Security/RoleChecker';

export interface Container {
  actionManager: ActionManager;
  adminManager: AdminManager;
  authManager: AuthManager;
  clusterManager: ClusterManager;
  db: Db;
  hub: SessionHub;
  invitationManager: InvitationManager;
  mailer: Mailer;
  noteManager: NoteManager;
  passwordResetManager: PasswordResetManager;
  platformManager: PlatformManager;
  retroManager: RetroManager;
  setupManager: SetupManager;
  teamManager: TeamManager;
  voteManager: VoteManager;
}

export const createContainer = (databaseFile = config.databaseFile): Container => {
  const db = createDb(databaseFile);

  const actionRepository = new ActionRepository(db);
  const boardRepository = new BoardRepository(db);
  const clusterRepository = new ClusterRepository(db);
  const columnRepository = new ColumnRepository(db);
  const invitationRepository = new InvitationRepository(db);
  const membershipRepository = new MembershipRepository(db);
  const noteRepository = new NoteRepository(db);
  const orgRepository = new OrgRepository(db);
  const retroRepository = new RetroRepository(db);
  const sessionRepository = new SessionRepository(db);
  const teamRepository = new TeamRepository(db);
  const userRepository = new UserRepository(db);
  const voteRepository = new VoteRepository(db);

  const accessChecker = new RetroAccessChecker(retroRepository, membershipRepository);
  const roleChecker = new RoleChecker();
  const hub = new SessionHub(db, boardRepository);
  const mailer = createMailer();

  const retroManager = new RetroManager(
    retroRepository,
    columnRepository,
    membershipRepository,
    boardRepository,
    accessChecker,
    roleChecker,
    voteRepository,
  );

  const invitationManager = new InvitationManager(
    invitationRepository,
    orgRepository,
    userRepository,
    roleChecker,
    mailer,
    sessionRepository,
  );

  const authManager = new AuthManager(
    db,
    new GoogleClient(config.googleClientId),
    userRepository,
    orgRepository,
    sessionRepository,
    invitationRepository,
    mailer,
  );

  hub.setAuthorizer(async (token, retroId) => {
    const auth = await authManager.resolveSession(token);

    if (!auth) {
      return false;
    }

    try {
      await accessChecker.checkRetroAccess(auth, retroId);
      return true;
    } catch {
      return false;
    }
  });

  return {
    actionManager: new ActionManager(
      actionRepository,
      boardRepository,
      membershipRepository,
      accessChecker,
    ),
    adminManager: new AdminManager(
      orgRepository,
      membershipRepository,
      retroRepository,
      sessionRepository,
      accessChecker,
      roleChecker,
      hub,
    ),
    authManager,
    clusterManager: new ClusterManager(
      clusterRepository,
      noteRepository,
      boardRepository,
      accessChecker,
      retroManager,
    ),
    db,
    hub,
    invitationManager,
    mailer,
    noteManager: new NoteManager(
      noteRepository,
      columnRepository,
      clusterRepository,
      accessChecker,
      retroManager,
    ),
    passwordResetManager: new PasswordResetManager(db, userRepository, sessionRepository, mailer),
    platformManager: new PlatformManager(db, orgRepository, sessionRepository, invitationManager),
    retroManager,
    setupManager: new SetupManager(db, orgRepository, userRepository, authManager),
    teamManager: new TeamManager(teamRepository, membershipRepository, roleChecker),
    voteManager: new VoteManager(voteRepository, boardRepository, accessChecker, retroManager),
  };
};
