import {EventEmitter} from 'node:events';
import {mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import SQLite from 'better-sqlite3';
import {Hono} from 'hono';
import {Harness} from '../helpers/harness';
import type {GoogleProfile} from '~/Client/GoogleClient';
import {errorHandler} from '~/Http/errorHandler';
import type {Variables} from '~/Http/middleware/auth';
import {authRoutes} from '~/Http/routes/auth';
import {orgRoutes} from '~/Http/routes/org';
import type {ProfileModel} from '~/Model/UserModel';
import {createSocketAttacher} from '~/Realtime/attachSocket';
import type {AuthContext} from '~/Security/AuthContext';

const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x20, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(24, 1),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 2)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);

/** BEHAVIOUR.md section 6, Profile: the user's own name and avatar, and what SSO may change. */
describe('profile', () => {
  let harness: Harness;
  let orgId: string;
  let admin: AuthContext;
  let alice: AuthContext;

  beforeEach(async () => {
    harness = Harness.create();
    orgId = await harness.createOrg('Acme');
    admin = await harness.createUser(orgId, 'Victor', 'admin');
    alice = await harness.createUser(orgId, 'Alice');
    await harness.container.platformManager.setDomainVerified(
      {...admin, isPlatformAdmin: true},
      orgId,
      'acme.test',
      true,
    );
  });

  afterEach(async () => harness.destroy());

  const api = (auth?: AuthContext) => {
    const app = new Hono<{Variables: Variables}>();

    app.onError(errorHandler);
    app.route('/', authRoutes(harness.container));
    app.use('*', async (context, next) => {
      if (auth) {
        context.set('auth', auth);
      }

      await next();
    });
    app.route('/', orgRoutes(harness.container));

    return app;
  };

  const patchMe = (auth: AuthContext, body: unknown) =>
    api(auth).request('/me', {
      body: JSON.stringify(body),
      headers: {'content-type': 'application/json'},
      method: 'PATCH',
    });

  const upload = (auth: AuthContext, bytes: Buffer, type = 'image/webp') =>
    api(auth).request('/me/avatar', {
      body: new Uint8Array(bytes),
      headers: {'content-type': type},
      method: 'PUT',
    });

  const me = (auth: AuthContext): Promise<ProfileModel> =>
    harness.container.authManager.getMe(auth);

  const signInWithGoogle = (profile: Partial<GoogleProfile> & {email: string}) => {
    jest
      .spyOn(harness.container.authManager['googleClient'], 'verifyIdToken')
      .mockResolvedValueOnce({name: 'Google Name', sub: `sub-${profile.email}`, ...profile});

    return harness.container.authManager.loginWithGoogle('id-token');
  };

  const authOf = async (userId: string): Promise<AuthContext> => {
    const row = (await harness.container.authManager.findUser(userId))!;
    const {token} = await harness.container.authManager.issueSession(row);

    return (await harness.container.authManager.resolveSession(token))!;
  };

  describe('name', () => {
    it('normalises the name, marks it as chosen, and shows it everywhere', async () => {
      const teamId = await harness.createTeam(admin, [alice]);
      const board = await harness.createStartedRetro(admin, teamId, 'Sprint 1');

      await harness.container.noteManager.create(alice, board.id, board.columns[0]!.id, 'hi');

      const response = await patchMe(alice, {name: '  Ada   Lovelace '});
      const body = (await response.json()) as ProfileModel;

      expect(response.status).toBe(200);
      expect(body.name).toBe('Ada Lovelace');
      expect(body.nameSource).toBe('user');

      const members = await harness.container.teamManager.listMembers(admin, teamId);
      const author = (await harness.container.retroManager.getBoard(admin, board.id)).columns[0]!
        .cards[0]!.notes[0]!.author;

      expect(members.find((member) => member.userId === alice.userId)?.name).toBe('Ada Lovelace');
      expect(author.name).toBe('Ada Lovelace');
    });

    it.each([
      ['empty', ''],
      ['blank', '   '],
      ['81 characters long', 'a'.repeat(81)],
      ['a control character', 'Ada\u0007'],
      ['a right-to-left override', 'Ada‮'],
      ['a zero-width space', 'Ada​'],
      ['only zero-width joiners', '\u200d \u200d'],
    ])('refuses a name that is %s', async (_label, name) => {
      expect((await patchMe(alice, {name})).status).toBe(400);
      expect((await me(alice)).name).toBe('Alice');
    });

    it('accepts emoji sequences and counts the limit after trimming', async () => {
      expect((await patchMe(alice, {name: 'Ada 👩‍💻'})).status).toBe(200);
      expect((await patchMe(alice, {name: `   ${'é'.repeat(80)}`})).status).toBe(200);
      expect((await me(alice)).name).toBe('é'.repeat(80));
    });

    it('refuses an empty body, and a name together with the Google name', async () => {
      expect((await patchMe(alice, {})).status).toBe(400);
      expect((await patchMe(alice, {name: 'Ada', useSsoName: true})).status).toBe(400);
    });

    it('takes the Google name back only once Google has given one', async () => {
      expect((await patchMe(alice, {useSsoName: true})).status).toBe(409);

      await signInWithGoogle({email: alice.email, name: 'Alice Google'});
      await patchMe(alice, {name: 'Ali'});

      const response = await patchMe(alice, {useSsoName: true});
      const body = (await response.json()) as ProfileModel;

      expect(response.status).toBe(200);
      expect(body).toMatchObject({hasSsoName: true, name: 'Alice Google', nameSource: 'sso'});
    });
  });

  describe('Google sign-in', () => {
    it('gives a new account the Google name and photo, following Google', async () => {
      const {user} = await signInWithGoogle({
        email: 'grace@acme.test',
        name: 'Grace Hopper',
        pictureUrl: 'https://lh3.test/grace',
      });
      const profile = await me(await authOf(user.id));

      expect(profile).toMatchObject({
        avatarSource: 'auto',
        name: 'Grace Hopper',
        nameSource: 'sso',
        pictureUrl: 'https://lh3.test/grace',
      });
    });

    it('refreshes an untouched profile, and answers with the new values already', async () => {
      await signInWithGoogle({email: 'grace@acme.test', name: 'Grace', pictureUrl: 'https://lh3.test/1'});

      const {user} = await signInWithGoogle({
        email: 'grace@acme.test',
        name: 'Grace Hopper',
        pictureUrl: 'https://lh3.test/2',
      });

      expect(user.name).toBe('Grace Hopper');
      expect(user.pictureUrl).toBe('https://lh3.test/2');
    });

    it('never overwrites a name the user chose', async () => {
      await signInWithGoogle({email: alice.email, name: 'Alice G'});
      await patchMe(alice, {name: 'Ali'});

      const {user} = await signInWithGoogle({email: alice.email, name: 'Alice Google'});

      expect(user.name).toBe('Ali');
      expect((await me(alice)).hasSsoName).toBe(true);
    });

    it('never overwrites an avatar the user chose, but remembers the Google photo', async () => {
      await patchMe(alice, {avatar: {source: 'initials'}});

      const first = await signInWithGoogle({email: alice.email, pictureUrl: 'https://lh3.test/a'});

      expect(first.user.pictureUrl).toBeUndefined();

      await upload(alice, WEBP);

      const uploaded = (await me(alice)).pictureUrl;
      const second = await signInWithGoogle({email: alice.email, pictureUrl: 'https://lh3.test/b'});

      expect(second.user.pictureUrl).toBe(uploaded);
      expect((await me(alice)).ssoPictureUrl).toBe('https://lh3.test/b');
    });

    it('gives an invited account its Google photo and keeps the invitation name', async () => {
      const send = jest.spyOn(harness.container.mailer, 'send');

      await harness.container.invitationManager.invite(admin, 'guest@globex.test');

      const token = send.mock.calls.at(-1)![0].link!.split('/').pop()!;
      const accepted = await harness.container.invitationManager.accept({
        name: 'Guest Typed',
        password: 'correct horse battery',
        token,
      });
      const {user} = await signInWithGoogle({
        email: 'guest@globex.test',
        name: 'Guest Google',
        pictureUrl: 'https://lh3.test/guest',
      });

      expect(user.id).toBe(accepted.userId);
      expect(user.name).toBe('Guest Typed');
      expect(user.pictureUrl).toBe('https://lh3.test/guest');
    });

    it('gives an unverified account taken over by Google the Google name', async () => {
      jest.spyOn(harness.container.mailer, 'send').mockResolvedValue();
      await harness.container.authManager.register({email: 'boss@acme.test', name: 'CEO'});

      const {user} = await signInWithGoogle({email: 'boss@acme.test', name: 'Real Owner'});

      expect(user.name).toBe('Real Owner');
      expect((await me(await authOf(user.id))).nameSource).toBe('sso');
    });

    it('drops a missing Google photo and cuts a long Google name to 80 characters', async () => {
      await signInWithGoogle({email: 'grace@acme.test', pictureUrl: 'https://lh3.test/1'});

      const {user} = await signInWithGoogle({email: 'grace@acme.test', name: 'g'.repeat(120)});
      const profile = await me(await authOf(user.id));

      expect(user.name).toBe('g'.repeat(80));
      expect(profile.pictureUrl).toBeUndefined();
      expect(profile.ssoPictureUrl).toBeUndefined();
    });

    it('turns whitespace of a Google name into spaces, and falls back to the email when nothing shows', async () => {
      const {user} = await signInWithGoogle({email: 'grace@acme.test', name: 'Grace\tHopper\u200b'});

      expect(user.name).toBe('Grace Hopper');

      const blank = await signInWithGoogle({email: 'grace@acme.test', name: '\u200d\u200d'});

      expect(blank.user.name).toBe('grace@acme.test');
    });

    it('leaves the Google values alone on a password sign-in', async () => {
      const response = await harness.registerAndConfirm({
        email: 'pat@acme.test',
        name: 'Pat',
        password: 'correct horse battery',
      });

      await harness.container.authManager.loginWithPassword('pat@acme.test', 'correct horse battery');

      expect(await me(await authOf(response.user.id))).toMatchObject({
        hasSsoName: false,
        nameSource: 'user',
      });
    });
  });

  describe('avatar', () => {
    it('stores an upload and serves the same bytes with locked-down headers', async () => {
      const response = await upload(alice, WEBP);
      const body = (await response.json()) as ProfileModel;

      expect(response.status).toBe(200);
      expect(body.avatarSource).toBe('upload');
      expect(body.pictureUrl).toMatch(/^\/api\/avatars\/av_[0-9a-f-]{36}$/);

      const image = await api().request(body.pictureUrl!.replace('/api', ''));

      expect(image.status).toBe(200);
      expect(Buffer.from(await image.arrayBuffer())).toEqual(WEBP);
      expect(image.headers.get('content-type')).toBe('image/webp');
      expect(image.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
      expect(image.headers.get('x-content-type-options')).toBe('nosniff');
      expect(image.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
      expect(image.headers.get('content-disposition')).toBe('inline');
    });

    it('accepts a JPEG announced as JPEG', async () => {
      expect((await upload(alice, JPEG, 'image/jpeg')).status).toBe(200);
    });

    it.each([
      ['a PNG', PNG, 'image/png'],
      ['a PNG announced as WebP', PNG, 'image/webp'],
      ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'],
      ['a JPEG announced as WebP', JPEG, 'image/webp'],
    ])('refuses %s with 415', async (_label, bytes, type) => {
      expect((await upload(alice, bytes, type)).status).toBe(415);
      expect((await me(alice)).avatarSource).toBe('auto');
    });

    it('refuses an image over 256 KB with 413', async () => {
      const big = Buffer.concat([WEBP, Buffer.alloc(256 * 1024)]);

      expect((await upload(alice, big)).status).toBe(413);
    });

    it('refuses the eleventh upload of the hour with 429', async () => {
      for (let index = 0; index < 10; index += 1) {
        expect((await upload(alice, WEBP)).status).toBe(200);
      }

      expect((await upload(alice, WEBP)).status).toBe(429);
    });

    it('replaces the previous upload, and removing it falls back to automatic', async () => {
      const first = ((await (await upload(alice, WEBP)).json()) as ProfileModel).pictureUrl!;
      const second = ((await (await upload(alice, JPEG, 'image/jpeg')).json()) as ProfileModel)
        .pictureUrl!;
      const rows = () => harness.container.db.selectFrom('userAvatars').selectAll().execute();

      expect(second).not.toBe(first);
      expect((await api().request(first.replace('/api', ''))).status).toBe(404);
      expect(await rows()).toHaveLength(1);

      const removed = await api(alice).request('/me/avatar', {method: 'DELETE'});

      expect(((await removed.json()) as ProfileModel).avatarSource).toBe('auto');
      expect(await rows()).toHaveLength(0);
      expect((await api().request(second.replace('/api', ''))).status).toBe(404);
    });

    it('switches to initials and back to the Google photo', async () => {
      await signInWithGoogle({email: alice.email, pictureUrl: 'https://lh3.test/a'});
      await upload(alice, WEBP);

      const initials = (await (await patchMe(alice, {avatar: {source: 'initials'}})).json()) as ProfileModel;

      expect(initials.pictureUrl).toBeUndefined();
      expect(await harness.container.db.selectFrom('userAvatars').selectAll().execute()).toHaveLength(0);

      const auto = (await (await patchMe(alice, {avatar: {source: 'auto'}})).json()) as ProfileModel;

      expect(auto.pictureUrl).toBe('https://lh3.test/a');
    });

    it('refuses an upload through PATCH', async () => {
      expect((await patchMe(alice, {avatar: {source: 'upload'}})).status).toBe(400);
    });
  });

  describe('moderation', () => {
    const removeAvatar = (auth: AuthContext, userId: string) =>
      api(auth).request(`/org/members/${userId}/avatar`, {method: 'DELETE'});

    it('lets an org admin remove an uploaded avatar, and nothing more', async () => {
      await upload(alice, WEBP);

      expect((await removeAvatar(alice, admin.userId)).status).toBe(403);
      expect((await removeAvatar(admin, alice.userId)).status).toBe(204);
      expect((await me(alice)).avatarSource).toBe('auto');
      expect((await removeAvatar(admin, alice.userId)).status).toBe(204);
    });

    it('leaves a chosen initials avatar alone', async () => {
      await patchMe(alice, {avatar: {source: 'initials'}});

      expect((await removeAvatar(admin, alice.userId)).status).toBe(204);
      expect((await me(alice)).avatarSource).toBe('initials');
    });
  });

  describe('live retros', () => {
    const connect = async (auth: AuthContext, retroId: string) => {
      const socket = Object.assign(new EventEmitter(), {
        close: jest.fn(),
        OPEN: 1,
        readyState: 1,
        sent: [] as string[],
        send(payload: string) {
          this.sent.push(payload);
        },
      });
      const row = (await harness.container.authManager.findUser(auth.userId))!;
      const {token} = await harness.container.authManager.issueSession(row);

      await createSocketAttacher(harness.container)(socket as never, token);
      socket.emit('message', JSON.stringify({action: 'subscribe', retroId}));
      await new Promise((resolve) => setTimeout(resolve, 30));

      return socket;
    };
    const events = (socket: {sent: string[]}, type: string) =>
      socket.sent.map((raw) => JSON.parse(raw)).filter((event) => event.type === type);

    it('shows a new name and avatar on every live board of the organisation, and no other', async () => {
      const bob = await harness.createUser(orgId, 'Bob');
      const teamId = await harness.createTeam(admin, [alice, bob]);
      const watched = await harness.createStartedRetro(admin, teamId, 'Watched');
      const other = await harness.createStartedRetro(admin, teamId, 'Other');

      await harness.container.noteManager.create(alice, other.id, other.columns[0]!.id, 'hi');

      const globexId = await harness.createOrg('Globex');
      const mallory = await harness.createUser(globexId, 'Mallory', 'admin');
      const globexBoard = await harness.container.retroManager.create(
        mallory,
        await harness.createTeam(mallory),
        'Globex',
      );

      const viewer = await connect(admin, watched.id);
      const subject = await connect(alice, watched.id);
      const elsewhere = await connect(bob, other.id);
      const stranger = await connect(mallory, globexBoard.id);
      const counts = () => [viewer, elsewhere, stranger].map((s) => s.sent.length);
      const before = counts();

      await patchMe(alice, {name: 'Ada'});
      await upload(alice, WEBP);

      const pictureUrl = (await me(alice)).pictureUrl;
      const presence = events(viewer, 'presence.updated').at(-1).participants;

      expect(presence.find((p: {userId: string}) => p.userId === alice.userId)).toEqual({
        name: 'Ada',
        pictureUrl,
        userId: alice.userId,
      });
      expect(events(subject, 'presence.updated').length).toBeGreaterThan(0);

      const otherBoard = events(elsewhere, 'board.updated').at(-1).board;

      expect(otherBoard.columns[0].cards[0].notes[0].author).toMatchObject({name: 'Ada', pictureUrl});
      expect(counts()[0]).toBeGreaterThan(before[0]!);
      expect(counts()[2]).toBe(before[2]);
    });

    it('sends no extra presence when nothing changed', async () => {
      const teamId = await harness.createTeam(admin, [alice]);
      const board = await harness.container.retroManager.create(admin, teamId, 'Quiet');
      const viewer = await connect(admin, board.id);
      const presences = events(viewer, 'presence.updated').length;

      await harness.container.hub.refreshRetros([board.id]);

      expect(events(viewer, 'presence.updated')).toHaveLength(presences);
      expect(events(viewer, 'board.updated').length).toBeGreaterThan(1);
    });
  });

  describe('migration', () => {
    const MIGRATIONS = join(__dirname, '../../src/Db/migrations');

    it('records Google pictures and names without touching the displayed values', () => {
      const directory = mkdtempSync(join(tmpdir(), 'pit-stop-profile-'));
      const sqlite = new SQLite(join(directory, 'before.db'));
      const files = readdirSync(MIGRATIONS).sort();
      const profile = files.find((name) => name.endsWith('_user_profile.sql'))!;
      const now = new Date().toISOString();

      try {
        for (const name of files.slice(0, files.indexOf(profile))) {
          sqlite.exec(readFileSync(join(MIGRATIONS, name), 'utf8'));
        }

        const addUser = sqlite.prepare(
          'INSERT INTO users (id, email, name, picture_url, email_verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        );
        const addCredential = sqlite.prepare(
          'INSERT INTO credentials (user_id, kind, provider_id, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
        );

        addUser.run('google', 'g@acme.test', 'Google Only', 'https://lh3.test/g', now, now);
        addUser.run('password', 'p@acme.test', 'Password Only', null, now, now);
        addUser.run('mixed', 'm@acme.test', 'Mixed', 'https://lh3.test/m', now, now);
        addCredential.run('google', 'google', 'sub-g', null, now);
        addCredential.run('password', 'password', null, 'hash', now);
        addCredential.run('mixed', 'google', 'sub-m', null, now);
        addCredential.run('mixed', 'password', null, 'hash', now);

        sqlite.exec(readFileSync(join(MIGRATIONS, profile), 'utf8'));

        const rows = sqlite
          .prepare('SELECT id, name, picture_url, sso_picture_url, name_source, avatar_source FROM users ORDER BY id')
          .all();

        expect(rows).toEqual([
          {avatar_source: 'auto', id: 'google', name: 'Google Only', name_source: 'sso', picture_url: 'https://lh3.test/g', sso_picture_url: 'https://lh3.test/g'},
          {avatar_source: 'auto', id: 'mixed', name: 'Mixed', name_source: 'user', picture_url: 'https://lh3.test/m', sso_picture_url: 'https://lh3.test/m'},
          {avatar_source: 'auto', id: 'password', name: 'Password Only', name_source: 'user', picture_url: null, sso_picture_url: null},
        ]);
      } finally {
        sqlite.close();
        rmSync(directory, {force: true, recursive: true});
      }
    });
  });
});
