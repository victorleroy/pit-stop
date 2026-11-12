import {EventEmitter} from 'node:events';
import {Harness} from '../helpers/harness';
import type {GameCar} from '~/Model/WebSocketModel';
import {createSocketAttacher} from '~/Realtime/attachSocket';
import {GAME_CHUNK_MS, wheelWindow} from '~/Realtime/LobbyGame';
import type {AuthContext} from '~/Security/AuthContext';

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

type FakeSocket = EventEmitter & {close: jest.Mock; events: () => {type: string; [key: string]: unknown}[]; sent: string[]};

/** The waiting-room game over real sockets of the hub (BEHAVIOUR.md section 8, ADR 0005). */
describe('waiting room game', () => {
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

  afterEach(async () => {
    jest.restoreAllMocks();
    await harness.destroy();
  });

  const sessionToken = async (auth: AuthContext): Promise<string> => {
    const row = (await harness.container.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', auth.userId)
      .executeTakeFirst())!;

    return (await harness.container.authManager.issueSession(row)).token;
  };

  const connect = async (auth: AuthContext, token?: string): Promise<FakeSocket> => {
    const socket = Object.assign(new EventEmitter(), {
      close: jest.fn(),
      OPEN: 1,
      readyState: 1,
      sent: [] as string[],
      send(payload: string) {
        this.sent.push(payload);
      },
      events() {
        return this.sent.map((raw) => JSON.parse(raw));
      },
    });

    await createSocketAttacher(harness.container)(socket as never, token ?? (await sessionToken(auth)));
    socket.emit('message', JSON.stringify({action: 'subscribe', retroId}));
    await settle();

    return socket as unknown as FakeSocket;
  };

  const send = async (socket: FakeSocket, payload: unknown) => {
    socket.emit('message', typeof payload === 'string' ? payload : JSON.stringify(payload));
    await settle();
  };

  const gameEvents = (socket: FakeSocket) =>
    socket.events().filter(({type}) => type.startsWith('game.'));

  const firstCar = (socket: FakeSocket): GameCar =>
    (socket.events().find(({type}) => type === 'game.spawns')!.cars as GameCar[])[0]!;

  /** Moves the service clock to an instant where the wheel can be hit. */
  const aimAt = (car: GameCar, wheel: 'front' | 'rear') => {
    const [opens, closes] = wheelWindow(car, wheel);

    jest.spyOn(Date, 'now').mockReturnValue(Math.round((opens + closes) / 2));
  };

  const start = () =>
    harness.container.hub.run(retroId, () =>
      harness.container.retroManager.updateRetro(owner, retroId, {phase: 'BRAINSTORM'}),
    );

  it('sends a snapshot, then the cars, to whoever joins', async () => {
    const victor = await connect(owner);

    await send(victor, {action: 'game.join'});

    const [state, spawns] = gameEvents(victor);

    expect(state).toMatchObject({cars: [], scores: [], teamStops: 0, type: 'game.state'});
    expect(spawns).toMatchObject({type: 'game.spawns'});
    expect((spawns!.cars as GameCar[]).length).toBeGreaterThan(0);
    expect(harness.container.hub.get(retroId)!.isGameRunning).toBe(true);
  });

  it('tells every player about a hit, with the total, and nobody else', async () => {
    const victor = await connect(owner);
    const alice = await connect(member);
    const watcher = await connect(member);

    await send(victor, {action: 'game.join'});
    await send(alice, {action: 'game.join'});

    const car = firstCar(victor);

    aimAt(car, 'rear');
    await send(alice, {action: 'game.hit', carId: car.id, wheel: 'rear'});
    await send(victor, {action: 'game.hit', carId: car.id, wheel: 'rear'});

    for (const player of [victor, alice]) {
      const hits = gameEvents(player).filter(({type}) => type === 'game.hit');

      expect(hits).toEqual([
        expect.objectContaining({carId: car.id, name: 'Alice', points: 1, userId: member.userId, wheel: 'rear'}),
      ]);
    }

    expect(gameEvents(watcher)).toEqual([]);
  });

  it('sends nothing more to somebody who left the game', async () => {
    const victor = await connect(owner);
    const alice = await connect(member);

    await send(victor, {action: 'game.join'});
    await send(alice, {action: 'game.join'});
    await send(alice, {action: 'game.leave'});

    const before = gameEvents(alice).length;
    const car = firstCar(victor);

    aimAt(car, 'front');
    await send(victor, {action: 'game.hit', carId: car.id, wheel: 'front'});
    await send(alice, {action: 'game.hit', carId: car.id, wheel: 'rear'});

    expect(gameEvents(alice)).toHaveLength(before);
    expect(gameEvents(victor).filter(({type}) => type === 'game.hit')).toHaveLength(1);
  });

  it('ends the game when the retro starts: board first, then the scores, to everyone', async () => {
    const victor = await connect(owner);
    const watcher = await connect(member);

    await send(victor, {action: 'game.join'});

    const car = firstCar(victor);

    aimAt(car, 'rear');
    await send(victor, {action: 'game.hit', carId: car.id, wheel: 'rear'});
    await start();

    for (const socket of [victor, watcher]) {
      const types = socket.events().map(({type}) => type);

      expect(types.slice(-2)).toEqual(['board.updated', 'game.ended']);
    }

    expect(watcher.events().at(-1)).toEqual({
      scores: [{name: 'Victor', points: 1, userId: owner.userId}],
      teamStops: 0,
      type: 'game.ended',
    });

    const count = victor.sent.length;

    await send(victor, {action: 'game.hit', carId: car.id, wheel: 'front'});
    await send(victor, {action: 'game.join'});

    expect(victor.sent).toHaveLength(count);
    expect(harness.container.hub.get(retroId)!.isGameRunning).toBe(false);
  });

  it('stops the game timer with the last connection', async () => {
    const victor = await connect(owner);

    await send(victor, {action: 'game.join'});
    victor.emit('close');

    expect(harness.container.hub.liveRetroCount).toBe(0);
  });

  it('refuses a revoked session on join and closes its socket', async () => {
    const token = await sessionToken(member);
    const alice = await connect(member, token);

    await harness.container.authManager.logout(token);
    await send(alice, {action: 'game.join'});

    expect(alice.events().at(-1)).toEqual({message: 'Retro not accessible', type: 'error'});
    expect(alice.close).toHaveBeenCalled();
    expect(gameEvents(alice)).toEqual([]);
  });

  it('ignores game messages before subscribing, and garbage', async () => {
    const socket = Object.assign(new EventEmitter(), {
      close: jest.fn(),
      OPEN: 1,
      readyState: 1,
      sent: [] as string[],
      send(payload: string) {
        this.sent.push(payload);
      },
    });

    await createSocketAttacher(harness.container)(socket as never, await sessionToken(owner));

    for (const payload of ['{"action":"game.join"}', '{"action":"game.hit","carId":1,"wheel":"rear"}', 'null', '{oops', '42']) {
      expect(() => socket.emit('message', payload)).not.toThrow();
    }

    await settle();

    const victor = await connect(owner);

    await send(victor, {action: 'game.join'});
    await send(victor, {action: 'game.hit', carId: -1, wheel: 'rear'});
    await send(victor, {action: 'game.hit', carId: 1.5, wheel: 'rear'});
    await send(victor, {action: 'game.hit', carId: 1, wheel: 'left'});

    expect(socket.sent).toEqual([]);
    expect(gameEvents(victor).filter(({type}) => type === 'game.hit')).toEqual([]);
  });

  it('evicts a player removed from the team at the next chunk of cars', async () => {
    const alice = await connect(member);
    const interval = jest.spyOn(global, 'setInterval');

    await send(alice, {action: 'game.join'});
    await harness.container.teamManager.removeMember(owner, teamId, member.userId);

    const before = gameEvents(alice).length;
    const [nextChunk, every] = interval.mock.calls.at(-1)!;

    expect(every).toBe(GAME_CHUNK_MS);
    (nextChunk as () => void)();
    await settle();

    expect(alice.events().at(-1)).toEqual({message: 'Retro not accessible', type: 'error'});
    expect(alice.close).toHaveBeenCalled();
    expect(gameEvents(alice)).toHaveLength(before);
  });

  it('stops the game without scores when the retro is deleted', async () => {
    const victor = await connect(owner);

    await send(victor, {action: 'game.join'});
    await harness.container.hub.run(retroId, () => harness.container.retroManager.remove(owner, retroId));

    expect(victor.events().at(-1)).toEqual({message: 'This retro was deleted', type: 'error'});
    expect(gameEvents(victor).some(({type}) => type === 'game.ended')).toBe(false);
    expect(harness.container.hub.get(retroId)!.isGameRunning).toBe(false);
  });
});
