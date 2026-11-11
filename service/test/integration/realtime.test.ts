import {EventEmitter} from 'node:events';
import {Hono} from 'hono';
import {Harness} from '../helpers/harness';
import {errorHandler} from '~/Http/errorHandler';
import type {Variables} from '~/Http/middleware/auth';
import {retroRoutes} from '~/Http/routes/retros';
import {teamRoutes} from '~/Http/routes/teams';
import {createSocketAttacher, tokenFromProtocols} from '~/Realtime/attachSocket';
import type {AuthContext} from '~/Security/AuthContext';

const fakeSocket = () => {
  const sent: string[] = [];

  return {
    sent,
    socket: {
      close: jest.fn(),
      OPEN: 1,
      readyState: 1,
      send: (payload: string) => sent.push(payload),
    } as never,
  };
};

/** ADR-001 D1: the hub serialises commands and fans boards out to those still allowed to see them. */
describe('live retros', () => {
  let harness: Harness;
  let owner: AuthContext;
  let member: AuthContext;
  let teamId: string;
  let retroId: string;

  beforeEach(async () => {
    harness = Harness.create();

    const orgId = await harness.createOrg('Acme');

    owner = await harness.createUser(orgId, 'Victor', 'admin');
    member = await harness.createUser(orgId, 'Alice');
    teamId = await harness.createTeam(owner, [member]);
    retroId = (await harness.container.retroManager.create(owner, teamId, 'Sprint 42')).id;
  });

  afterEach(async () => harness.destroy());

  const sessionToken = async (auth: AuthContext): Promise<string> => {
    const user = await harness.container.authManager.getMe(auth);
    const row = (await harness.container.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .executeTakeFirst())!;

    return (await harness.container.authManager.issueSession(row)).token;
  };

  it('leaves no live retro behind a command, even one that fails', async () => {
    await harness.container.hub.run(retroId, async () => 'done');
    await expect(
      harness.container.hub.run('retro_missing', async () => {
        throw new Error('not found');
      }),
    ).rejects.toThrow('not found');

    expect(harness.container.hub.liveRetroCount).toBe(0);
  });

  it('runs the commands of one retro one at a time', async () => {
    const order: string[] = [];
    const slow = harness.container.hub.run(retroId, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('first');
    });
    const fast = harness.container.hub.run(retroId, async () => {
      order.push('second');
    });

    await Promise.all([slow, fast]);

    expect(order).toEqual(['first', 'second']);
  });

  it('stops sending the board to somebody removed from the team', async () => {
    const {sent, socket} = fakeSocket();
    const session = harness.container.hub.acquire(retroId);

    session.add({name: 'Alice', socket, token: await sessionToken(member), userId: member.userId});

    await session.broadcastBoard();
    expect(sent.at(-1)).toContain('board.updated');

    await harness.container.teamManager.removeMember(owner, teamId, member.userId);
    await session.broadcastBoard();

    expect(sent.at(-1)).toContain('Retro not accessible');
    expect(session.size).toBe(0);
  });

  /** Regression: a slower access check let an older subscribe win over the latest one. */
  it('keeps a socket on the retro it asked for last when two subscribes overlap', async () => {
    const otherRetroId = (await harness.container.retroManager.create(owner, teamId, 'Sprint 43'))
      .id;
    const getBoard = harness.container.retroManager.getBoard.bind(harness.container.retroManager);

    jest
      .spyOn(harness.container.retroManager, 'getBoard')
      .mockImplementation(async (auth, target) => {
        if (target === retroId) {
          await new Promise((resolve) => setTimeout(resolve, 30));
        }

        return getBoard(auth, target);
      });

    const sent: string[] = [];
    const socket = Object.assign(new EventEmitter(), {
      close: jest.fn(),
      OPEN: 1,
      readyState: 1,
      send: (payload: string) => sent.push(payload),
    });

    await createSocketAttacher(harness.container)(socket as never, await sessionToken(member));

    socket.emit('message', JSON.stringify({action: 'subscribe', retroId}));
    socket.emit('message', JSON.stringify({action: 'subscribe', retroId: otherRetroId}));
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(harness.container.hub.get(retroId)).toBeUndefined();
    expect(harness.container.hub.get(otherRetroId)?.size).toBe(1);

    const boards = sent.map((raw) => JSON.parse(raw)).filter((event) => event.type === 'board.updated');

    expect(boards.at(-1).board.id).toBe(otherRetroId);
  });

  it('relays cursors in every phase except BRAINSTORM and VOTE', async () => {
    const connect = async (auth: AuthContext) => {
      const socket = Object.assign(new EventEmitter(), {
        close: jest.fn(),
        OPEN: 1,
        readyState: 1,
        sent: [] as string[],
        send(payload: string) {
          this.sent.push(payload);
        },
      });

      await createSocketAttacher(harness.container)(socket as never, await sessionToken(auth));
      socket.emit('message', JSON.stringify({action: 'subscribe', retroId}));
      await new Promise((resolve) => setTimeout(resolve, 30));

      return socket;
    };
    const mover = await connect(owner);
    const watcher = await connect(member);
    const received = () => watcher.sent.filter((raw) => raw.includes('cursor.moved')).length;
    const move = async () => {
      mover.emit('message', JSON.stringify({action: 'cursor', x: 0.5, y: 0.5}));
      await new Promise((resolve) => setTimeout(resolve, 5));
    };
    const enter = async (phase: 'BRAINSTORM' | 'SHARE' | 'VOTE' | 'DISCUSS' | 'ARCHIVED') => {
      await harness.container.hub.run(retroId, () =>
        harness.container.retroManager.updateRetro(owner, retroId, {phase}),
      );
    };
    let expected = 0;

    await move();
    expect(received()).toBe(expected);

    for (const [phase, visible] of [
      ['SHARE', true],
      ['VOTE', false],
      ['DISCUSS', true],
    ] as const) {
      await enter(phase);
      await move();
      expected += visible ? 1 : 0;
      expect(received()).toBe(expected);
    }
  });

  /** The session token travels in the subprotocol header, never in a URL a proxy logs. */
  it('reads the session token from the websocket subprotocols only', () => {
    expect(tokenFromProtocols('pit-stop, abc_DEF-123')).toBe('abc_DEF-123');
    expect(tokenFromProtocols('abc_DEF-123')).toBeUndefined();
    expect(tokenFromProtocols(undefined)).toBeUndefined();
  });

  /** Every board mutation, action edits included, goes through the retro queue. */
  it('serialises an action edit in the queue of its retro', async () => {
    await harness.container.retroManager.updateRetro(owner, retroId, {phase: 'DISCUSS'});

    const action = await harness.container.actionManager.create(owner, retroId, 'Fix the CI');
    const run = jest.spyOn(harness.container.hub, 'run');
    const app = new Hono<{Variables: Variables}>();

    app.use('*', async (context, next) => {
      context.set('auth', owner);
      await next();
    });
    app.route('/', teamRoutes(harness.container));

    const response = await app.request(`/teams/${teamId}/actions/${action.id}`, {
      body: JSON.stringify({status: 'DONE'}),
      headers: {'content-type': 'application/json'},
      method: 'PATCH',
    });

    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledWith(retroId, expect.any(Function));
  });

  /** Regression: DELETE /notes/:noteId was declared first and swallowed /notes/reveal. */
  it('lets an author take shared notes back over HTTP', async () => {
    const board = await harness.container.retroManager.getBoard(owner, retroId);

    await harness.container.noteManager.create(member, retroId, board.columns[0]!.id, 'mine');
    await harness.container.retroManager.updateRetro(owner, retroId, {phase: 'SHARE'});

    const app = new Hono<{Variables: Variables}>();

    app.use('*', async (context, next) => {
      context.set('auth', member);
      await next();
    });
    app.route('/', retroRoutes(harness.container));

    expect((await app.request(`/retros/${retroId}/notes/reveal`, {method: 'POST'})).status).toBe(200);

    const hidden = await app.request(`/retros/${retroId}/notes/reveal`, {method: 'DELETE'});

    expect(hidden.status).toBe(200);
    expect(((await hidden.json()) as {myNotesRevealed: boolean}).myNotesRevealed).toBe(false);
  });

  it('shares and hides a single note over HTTP, through the hub', async () => {
    const board = await harness.container.retroManager.getBoard(owner, retroId);

    await harness.container.noteManager.create(member, retroId, board.columns[0]!.id, 'mine');
    await harness.container.retroManager.updateRetro(owner, retroId, {phase: 'SHARE'});

    const noteId = (await harness.container.retroManager.getBoard(member, retroId)).columns[0]!
      .cards[0]!.notes[0]!.id;
    const run = jest.spyOn(harness.container.hub, 'run');
    const app = new Hono<{Variables: Variables}>();

    app.use('*', async (context, next) => {
      context.set('auth', member);
      await next();
    });
    app.route('/', retroRoutes(harness.container));

    const shared = await app.request(`/retros/${retroId}/notes/${noteId}/reveal`, {method: 'POST'});

    expect(shared.status).toBe(200);
    expect(run).toHaveBeenCalledWith(retroId, expect.any(Function));
    expect((await harness.container.retroManager.getBoard(owner, retroId)).columns[0]!.cards[0]!
      .notes[0]!.text).toBe('mine');

    const hidden = await app.request(`/retros/${retroId}/notes/${noteId}/reveal`, {method: 'DELETE'});

    expect(hidden.status).toBe(200);
    expect((await harness.container.retroManager.getBoard(owner, retroId)).columns[0]!.cards[0]!
      .notes[0]!.text).toBe('');
  });

  it('lets the facilitator alone draw a speaking order, sent to everyone and to late joiners', async () => {
    const connect = async (auth: AuthContext) => {
      const socket = Object.assign(new EventEmitter(), {
        close: jest.fn(),
        OPEN: 1,
        readyState: 1,
        sent: [] as string[],
        send(payload: string) {
          this.sent.push(payload);
        },
      });

      await createSocketAttacher(harness.container)(socket as never, await sessionToken(auth));
      socket.emit('message', JSON.stringify({action: 'subscribe', retroId}));
      await new Promise((resolve) => setTimeout(resolve, 30));

      return socket;
    };
    const orders = (socket: {sent: string[]}) =>
      socket.sent.map((raw) => JSON.parse(raw)).filter((event) => event.type === 'speakingOrder.drawn');
    const request = (auth: AuthContext) => {
      const app = new Hono<{Variables: Variables}>();

      app.use('*', async (context, next) => {
        context.set('auth', auth);
        await next();
      });
      app.route('/', retroRoutes(harness.container));
      app.onError(errorHandler);

      return app.request(`/retros/${retroId}/speaking-order`, {method: 'POST'});
    };

    const facilitator = await connect(owner);
    const participant = await connect(member);

    expect((await request(member)).status).toBe(403);
    expect(orders(participant)).toHaveLength(0);

    const response = await request(owner);
    const {order} = (await response.json()) as {order: {userId: string}[]};

    expect(response.status).toBe(200);
    expect(order.map(({userId}) => userId).sort()).toEqual([member.userId, owner.userId].sort());
    expect(orders(facilitator).at(-1).order).toEqual(order);
    expect(orders(participant).at(-1).order).toEqual(order);

    const lateTab = await connect(member);

    expect(orders(lateTab).at(-1).order).toEqual(order);
  });
});
