import {Hono} from 'hono';
import {Harness} from '../helpers/harness';
import {errorHandler} from '~/Http/errorHandler';
import type {Variables} from '~/Http/middleware/auth';
import {retroRoutes} from '~/Http/routes/retros';
import {templateRoutes} from '~/Http/routes/templates';
import type {TeamTemplatesModel, TemplateModel} from '~/Model/TemplateModel';
import type {ColumnRepository} from '~/Repository/ColumnRepository';
import type {TemplateContent} from '~/Repository/RetroTemplateRepository';
import type {AuthContext} from '~/Security/AuthContext';

/** Templates spec section 4: team formats, the classics, and what a retro copies from them. */
describe('retro templates', () => {
  let harness: Harness;
  let orgId: string;
  let admin: AuthContext;
  let member: AuthContext;
  let orgAdmin: AuthContext;
  let teamId: string;

  beforeEach(async () => {
    harness = Harness.create();
    orgId = await harness.createOrg();
    admin = await harness.createUser(orgId, 'Victor');
    member = await harness.createUser(orgId, 'Alice');
    orgAdmin = await harness.createUser(orgId, 'Olga', 'admin');
    teamId = await harness.createTeam(admin, [member]);
  });

  afterEach(async () => harness.destroy());

  const request = async (auth: AuthContext, path: string, method = 'GET', body?: unknown) => {
    const app = new Hono<{Variables: Variables}>();

    app.onError(errorHandler);
    app.use('*', async (context, next) => {
      context.set('auth', auth);
      await next();
    });
    app.route('/', templateRoutes(harness.container));
    app.route('/', retroRoutes(harness.container));

    const response = await app.request(path, {
      ...(body === undefined
        ? {}
        : {body: JSON.stringify(body), headers: {'content-type': 'application/json'}}),
      method,
    });
    const text = await response.text();

    return {body: text ? JSON.parse(text) : null, status: response.status};
  };

  const content = (name: string, overrides: Partial<TemplateContent> = {}): TemplateContent => ({
    columns: [
      {prompt: 'What went well', title: 'Good'},
      {prompt: null, title: 'Bad'},
    ],
    description: null,
    maxVotes: null,
    name,
    timerSeconds: null,
    ...overrides,
  });

  const createTemplate = (name: string, overrides: Partial<TemplateContent> = {}, team = teamId) =>
    harness.container.retroTemplateManager.create(admin, team, content(name, overrides));

  const list = async (auth: AuthContext = admin, team = teamId) =>
    (await request(auth, `/teams/${team}/templates`)).body as TeamTemplatesModel;

  const startStopContinue = {id: 'builtin:start-stop-continue', name: 'Start / Stop / Continue'};

  const otherTeam = async (owner: AuthContext = admin, name = 'Core') =>
    (await harness.container.teamManager.createTeam(owner, name)).id;

  describe('CRUD', () => {
    it('creates a template for the team', async () => {
      const response = await request(admin, `/teams/${teamId}/templates`, 'POST', {
        columns: [{prompt: 'What went well', title: 'Good'}, {title: 'Bad'}],
        description: 'Ours',
        maxVotes: 4,
        name: 'Weekly',
        timerSeconds: 300,
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        columns: [
          {prompt: 'What went well', title: 'Good'},
          {prompt: null, title: 'Bad'},
        ],
        description: 'Ours',
        maxVotes: 4,
        name: 'Weekly',
        scope: 'TEAM',
        timerSeconds: 300,
        updatedBy: {id: admin.userId, name: 'Victor'},
      });
    });

    it('lists the team templates by name, the classics with Blank last, and the default', async () => {
      await createTemplate('zulu');
      await createTemplate('Alpha');

      const listed = await list(member);

      expect(listed.team.map(({name}) => name)).toEqual(['Alpha', 'zulu']);
      expect(listed.builtin).toHaveLength(13);
      expect(listed.builtin.at(-1)).toMatchObject({columns: [], id: 'builtin:blank'});
      expect(listed.builtin.every(({scope}) => scope === 'BUILTIN')).toBe(true);
      expect(listed.defaultTemplateId).toBe('builtin:start-stop-continue');
    });

    it('replaces the whole content and records who edited it last', async () => {
      const created = await createTemplate('Weekly', {maxVotes: 3});

      await harness.container.teamManager.addMember(admin, teamId, orgAdmin.userId);

      const response = await request(orgAdmin, `/teams/${teamId}/templates/${created.id}`, 'PUT', {
        columns: [{prompt: 'Only one', title: 'Single'}],
        name: 'Weekly v2',
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        columns: [{prompt: 'Only one', title: 'Single'}],
        description: null,
        id: created.id,
        maxVotes: null,
        name: 'Weekly v2',
        updatedBy: {id: orgAdmin.userId, name: 'Olga'},
      });
      expect((await list()).team).toEqual([response.body]);
    });

    it('keeps the name of a template when only its columns change', async () => {
      const created = await createTemplate('Weekly');

      const response = await request(admin, `/teams/${teamId}/templates/${created.id}`, 'PUT', {
        columns: [],
        name: 'weekly',
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({columns: [], name: 'weekly'});
    });

    it('deletes a template', async () => {
      const created = await createTemplate('Weekly');

      const response = await request(admin, `/teams/${teamId}/templates/${created.id}`, 'DELETE');

      expect(response.status).toBe(204);
      expect((await list()).team).toEqual([]);
    });

    it('refuses to edit or delete a classic or the template of another team with a 404', async () => {
      const elsewhere = await createTemplate('Elsewhere', {}, await otherTeam());

      for (const id of ['builtin:pit-stop', elsewhere.id, 'unknown']) {
        const edited = await request(admin, `/teams/${teamId}/templates/${id}`, 'PUT', {
          columns: [],
          name: 'Mine now',
        });
        const deleted = await request(admin, `/teams/${teamId}/templates/${id}`, 'DELETE');

        expect(edited).toEqual({body: {message: 'Template not found'}, status: 404});
        expect(deleted).toEqual({body: {message: 'Template not found'}, status: 404});
      }
    });
  });

  describe('validation', () => {
    const post = (body: unknown) => request(admin, `/teams/${teamId}/templates`, 'POST', body);

    it('refuses more than 8 columns, a title over 40 and a prompt over 140', async () => {
      const columns = (count: number) =>
        Array.from({length: count}, (_, index) => ({title: `Column ${index}`}));

      expect((await post({columns: columns(8), name: 'Eight'})).status).toBe(201);
      expect((await post({columns: columns(9), name: 'Nine'})).status).toBe(400);
      expect((await post({columns: [{title: 'x'.repeat(41)}], name: 'Long'})).status).toBe(400);
      expect(
        (await post({columns: [{prompt: 'x'.repeat(141), title: 'Ok'}], name: 'Wordy'})).status,
      ).toBe(400);
      expect((await post({columns: [{title: '   '}], name: 'Blank title'})).status).toBe(400);
    });

    it('refuses a name over 60, a description over 200, votes or a timer out of bounds', async () => {
      expect((await post({columns: [], name: 'x'.repeat(61)})).status).toBe(400);
      expect((await post({columns: [], name: '   '})).status).toBe(400);
      expect((await post({columns: [], description: 'x'.repeat(201), name: 'A'})).status).toBe(400);
      expect((await post({columns: [], maxVotes: 11, name: 'A'})).status).toBe(400);
      expect((await post({columns: [], name: 'A', timerSeconds: 3601})).status).toBe(400);
      expect((await post({columns: [], name: 'A', timerSeconds: 4})).status).toBe(400);
    });

    it('refuses two columns with the same title, whatever the case and blanks', async () => {
      const response = await post({columns: [{title: ' Ideas'}, {title: 'ideas'}], name: 'Dupe'});

      expect(response.status).toBe(400);
      expect((await list()).team).toEqual([]);
    });

    it('trims the texts and turns a blank prompt into none', async () => {
      const response = await post({
        columns: [{prompt: '   ', title: ' Good '}],
        description: '  ',
        name: '  Foo ',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        columns: [{prompt: null, title: 'Good'}],
        description: null,
        name: 'Foo',
      });
    });

    it('allows a template without any column', async () => {
      expect((await post({columns: [], name: 'Empty'})).status).toBe(201);
    });

    it('refuses a name already used in the team, whatever the case', async () => {
      await createTemplate('Weekly');

      const response = await post({columns: [], name: ' WEEKLY '});

      expect(response).toEqual({
        body: {message: 'A template with this name already exists'},
        status: 409,
      });
    });

    it('refuses to rename a template to the name of another one', async () => {
      await createTemplate('Weekly');
      const other = await createTemplate('Monthly');

      const response = await request(admin, `/teams/${teamId}/templates/${other.id}`, 'PUT', {
        columns: [],
        name: 'weekly',
      });

      expect(response.status).toBe(409);
    });

    it('accepts a name used by another team or by a classic', async () => {
      await createTemplate('Weekly', {}, await otherTeam());

      expect((await post({columns: [], name: 'Weekly'})).status).toBe(201);
      expect((await post({columns: [], name: 'Start / Stop / Continue'})).status).toBe(201);
    });

    it('refuses the 51st template of a team', async () => {
      for (let index = 0; index < 50; index += 1) {
        await createTemplate(`Template ${index}`);
      }

      expect(await post({columns: [], name: 'One too many'})).toEqual({
        body: {message: 'Template limit reached'},
        status: 409,
      });
    });
  });

  describe('roles', () => {
    it('lets a member read the templates and nothing more', async () => {
      const created = await createTemplate('Weekly');
      const refusal = {body: {message: 'Only a team administrator can do this'}, status: 403};
      const base = `/teams/${teamId}`;

      expect((await request(member, `${base}/templates`)).status).toBe(200);
      expect(await request(member, `${base}/templates`, 'POST', {columns: [], name: 'A'})).toEqual(
        refusal,
      );
      expect(
        await request(member, `${base}/templates/${created.id}`, 'PUT', {columns: [], name: 'A'}),
      ).toEqual(refusal);
      expect(await request(member, `${base}/templates/${created.id}`, 'DELETE')).toEqual(refusal);
      expect(
        await request(member, `${base}/templates/duplicate`, 'POST', {
          sourceTemplateId: 'builtin:kalm',
        }),
      ).toEqual(refusal);
      expect(
        await request(member, `${base}/default-template`, 'PUT', {templateId: 'builtin:kalm'}),
      ).toEqual(refusal);
      expect((await list()).team.map(({name}) => name)).toEqual(['Weekly']);
    });

    it('lets an organisation administrator who joined the team write', async () => {
      await harness.container.teamManager.addMember(admin, teamId, orgAdmin.userId);

      const response = await request(orgAdmin, `/teams/${teamId}/templates`, 'POST', {
        columns: [],
        name: 'Weekly',
      });

      expect(response.status).toBe(201);
    });

    it('keeps an organisation administrator outside the team from reading or writing', async () => {
      const refusal = {body: {message: 'You are not a member of this team'}, status: 403};

      expect(await request(orgAdmin, `/teams/${teamId}/templates`)).toEqual(refusal);
      expect(
        await request(orgAdmin, `/teams/${teamId}/templates`, 'POST', {columns: [], name: 'A'}),
      ).toEqual(refusal);
    });

    it('keeps somebody of another organisation out', async () => {
      const stranger = await harness.createUser(await harness.createOrg('Globex'), 'Mallory', 'admin');

      expect((await request(stranger, `/teams/${teamId}/templates`)).status).toBe(403);
      expect(
        (await request(stranger, `/teams/${teamId}/templates`, 'POST', {columns: [], name: 'A'}))
          .status,
      ).toBe(403);
    });
  });

  describe('duplication', () => {
    const duplicate = (body: {name?: string; sourceTemplateId: string}, team = teamId) =>
      request(admin, `/teams/${team}/templates/duplicate`, 'POST', body);

    it('copies a classic, then numbers the next copies', async () => {
      const first = await duplicate({sourceTemplateId: 'builtin:plus-delta'});
      const second = await duplicate({sourceTemplateId: 'builtin:plus-delta'});
      const third = await duplicate({sourceTemplateId: 'builtin:plus-delta'});

      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        columns: [
          {prompt: 'What went well', title: 'Plus'},
          {prompt: 'What we would change, phrased as a change', title: 'Delta'},
        ],
        name: 'Plus / Delta (copy)',
        scope: 'TEAM',
        timerSeconds: 600,
      });
      expect(first.body.id).not.toBe('builtin:plus-delta');
      expect(second.body.name).toBe('Plus / Delta (copy 2)');
      expect(third.body.name).toBe('Plus / Delta (copy 3)');
    });

    it('takes the given name instead', async () => {
      const response = await duplicate({name: ' Ours ', sourceTemplateId: 'builtin:kalm'});

      expect(response.body).toMatchObject({name: 'Ours'});
    });

    it('keeps a copy within 60 characters', async () => {
      const source = await createTemplate('x'.repeat(60));

      const response = await duplicate({sourceTemplateId: source.id});

      expect(response.body.name).toHaveLength(60);
      expect(response.body.name).toMatch(/ \(copy\)$/);
    });

    it('copies a template from another team of the caller, independently', async () => {
      const sourceTeamId = await otherTeam();
      const source = await createTemplate('Weekly', {maxVotes: 2}, sourceTeamId);

      const response = await duplicate({sourceTemplateId: source.id});

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        columns: source.columns,
        maxVotes: 2,
        name: 'Weekly (copy)',
      });

      await harness.container.retroTemplateManager.update(
        admin,
        sourceTeamId,
        source.id,
        content('Changed', {columns: []}),
      );

      expect((await list()).team).toEqual([response.body]);
    });

    it('answers 404 for a template of a team the caller has not joined', async () => {
      const outsider = await harness.createUser(orgId, 'Eve');
      const source = await harness.container.retroTemplateManager.create(
        outsider,
        await otherTeam(outsider, 'Secret'),
        content('Hidden'),
      );

      expect(await duplicate({sourceTemplateId: source.id})).toEqual({
        body: {message: 'Template not found'},
        status: 404,
      });
    });

    it('answers 404 for a template of another organisation', async () => {
      const stranger = await harness.createUser(await harness.createOrg('Globex'), 'Mallory');
      const source = await harness.container.retroTemplateManager.create(
        stranger,
        await otherTeam(stranger, 'Globex team'),
        content('Hidden'),
      );

      expect((await duplicate({sourceTemplateId: source.id})).status).toBe(404);
      expect((await duplicate({sourceTemplateId: 'builtin:unknown'})).status).toBe(404);
    });
  });

  describe('save as template', () => {
    let retroId: string;

    beforeEach(async () => {
      retroId = (
        await harness.container.retroManager.create(admin, teamId, 'Sprint 42', {
          maxVotes: 7,
          templateId: 'builtin:start-stop-continue',
        })
      ).id;
    });

    const save = (auth: AuthContext = admin, body: unknown = {name: 'Ours'}) =>
      request(auth, `/retros/${retroId}/template`, 'POST', body);

    const setPhases = async (...phases: ('SHARE' | 'VOTE' | 'DISCUSS' | 'ARCHIVED')[]) => {
      for (const phase of phases) {
        await harness.container.retroManager.updateRetro(admin, retroId, {phase});
      }
    };

    it('copies the columns in board order with their prompts and the vote budget', async () => {
      const board = await harness.container.retroManager.getBoard(admin, retroId);
      const [start, stop, keep] = board.columns.map(({id}) => id);

      await harness.container.retroManager.reorderColumns(admin, retroId, [keep!, start!, stop!]);
      await harness.container.noteManager.create(admin, retroId, start!, 'the secret');

      const run = jest.spyOn(harness.container.hub, 'run');
      const response = await save(admin, {description: 'From sprint 42', name: ' Ours '});

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        columns: [
          {prompt: 'Something that works and must stay', title: 'Continue'},
          {prompt: 'Something we should try next sprint', title: 'Start'},
          {prompt: 'Something that costs us more than it gives', title: 'Stop'},
        ],
        description: 'From sprint 42',
        maxVotes: 7,
        name: 'Ours',
        scope: 'TEAM',
        timerSeconds: null,
      });
      expect(JSON.stringify(response.body)).not.toContain('the secret');
      expect(run).toHaveBeenCalledWith(retroId, expect.any(Function));
    });

    it('works on an archived retro', async () => {
      await setPhases('SHARE', 'VOTE', 'DISCUSS', 'ARCHIVED');

      expect((await save()).status).toBe(201);
    });

    it('turns a board without columns into a template without columns', async () => {
      retroId = (
        await harness.container.retroManager.create(admin, teamId, 'Blank', {columns: []})
      ).id;

      expect((await save()).body).toMatchObject({columns: [], maxVotes: 5});
    });

    it('never keeps the timer, even extended past an hour', async () => {
      await harness.container.retroManager.updateRetro(admin, retroId, {
        timer: {action: 'start', seconds: 3600},
      });
      await harness.container.retroManager.updateRetro(admin, retroId, {
        timer: {action: 'extend', seconds: 60},
      });

      const response = await save();

      expect(response.status).toBe(201);
      expect(response.body.timerSeconds).toBeNull();
    });

    it('is refused to a participant who is not a team administrator', async () => {
      expect(await save(member)).toEqual({
        body: {message: 'Only a team administrator can do this'},
        status: 403,
      });
    });

    it('refuses a board of more than 8 columns', async () => {
      for (let index = 4; index <= 9; index += 1) {
        await harness.container.retroManager.addColumn(admin, retroId, `Column ${index}`);
      }

      expect(await save()).toEqual({
        body: {message: 'A template holds at most 8 columns: remove some first'},
        status: 409,
      });
    });

    it('refuses a board with two columns of the same title', async () => {
      await harness.container.retroManager.addColumn(admin, retroId, ' start');

      expect(await save()).toEqual({
        body: {message: 'Two columns have the same title: rename one first'},
        status: 409,
      });
    });

    it('refuses a name already used in the team', async () => {
      await createTemplate('Ours');

      expect((await save()).status).toBe(409);
    });
  });

  describe('team default', () => {
    const setDefault = (templateId: string | null, auth = admin) =>
      request(auth, `/teams/${teamId}/default-template`, 'PUT', {templateId});

    it('accepts a classic', async () => {
      expect(await setDefault('builtin:plus-delta')).toEqual({
        body: {defaultTemplateId: 'builtin:plus-delta'},
        status: 200,
      });
      expect((await list(member)).defaultTemplateId).toBe('builtin:plus-delta');
    });

    it('accepts a team template, then used by a retro created with neither', async () => {
      const weekly = await createTemplate('Weekly', {timerSeconds: 120});

      expect((await setDefault(weekly.id)).status).toBe(200);
      expect((await list()).defaultTemplateId).toBe(weekly.id);

      const board = await harness.container.retroManager.create(admin, teamId, 'Sprint 42');

      expect(board.columns.map(({prompt, title}) => ({prompt, title}))).toEqual(weekly.columns);
      expect(board.template).toEqual({id: weekly.id, name: 'Weekly'});
      expect(board.defaultTimerSeconds).toBe(120);
    });

    it('refuses a template of another team or an unknown classic', async () => {
      const elsewhere = await createTemplate('Elsewhere', {}, await otherTeam());

      expect((await setDefault(elsewhere.id)).status).toBe(404);
      expect((await setDefault('builtin:unknown')).status).toBe(404);
      expect((await list()).defaultTemplateId).toBe('builtin:start-stop-continue');
    });

    it('falls back to Start / Stop / Continue once the default is deleted', async () => {
      const weekly = await createTemplate('Weekly');

      await setDefault(weekly.id);
      await request(admin, `/teams/${teamId}/templates/${weekly.id}`, 'DELETE');

      expect((await list()).defaultTemplateId).toBe('builtin:start-stop-continue');

      const team = await harness.container.db
        .selectFrom('teams')
        .select('defaultTemplateId')
        .where('id', '=', teamId)
        .executeTakeFirstOrThrow();

      expect(team.defaultTemplateId).toBeNull();

      const board = await harness.container.retroManager.create(admin, teamId, 'Sprint 42');

      expect(board.template).toEqual(startStopContinue);
    });

    it('goes back to Start / Stop / Continue with null', async () => {
      await setDefault('builtin:kalm');

      expect(await setDefault(null)).toEqual({
        body: {defaultTemplateId: 'builtin:start-stop-continue'},
        status: 200,
      });
      expect((await list()).defaultTemplateId).toBe('builtin:start-stop-continue');
    });
  });

  describe('retro creation', () => {
    const create = (options: {columns?: string[]; maxVotes?: number; templateId?: string} = {}) =>
      harness.container.retroManager.create(admin, teamId, 'Sprint 42', options);

    const shape = (board: Awaited<ReturnType<typeof create>>) =>
      board.columns.map(({prompt, title}) => ({prompt, title}));

    it('refuses a template and columns together', async () => {
      const response = await request(admin, `/teams/${teamId}/retros`, 'POST', {
        columns: ['A'],
        templateId: 'builtin:kalm',
        title: 'Sprint 42',
      });

      expect(response.status).toBe(400);
      expect(await harness.container.retroManager.listByTeam(admin, teamId)).toEqual([]);
    });

    it('copies a team template: columns, prompts, name, timer and votes', async () => {
      const weekly = await createTemplate('Weekly', {maxVotes: 4, timerSeconds: 120});

      const response = await request(admin, `/teams/${teamId}/retros`, 'POST', {
        templateId: weekly.id,
        title: 'Sprint 42',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        columns: [
          {prompt: 'What went well', title: 'Good'},
          {prompt: null, title: 'Bad'},
        ],
        defaultTimerSeconds: 120,
        maxVotes: 4,
        template: {id: weekly.id, name: 'Weekly'},
      });
    });

    it('copies a classic', async () => {
      const board = await create({templateId: 'builtin:plus-delta'});

      expect(shape(board)).toEqual([
        {prompt: 'What went well', title: 'Plus'},
        {prompt: 'What we would change, phrased as a change', title: 'Delta'},
      ]);
      expect(board.template).toEqual({id: 'builtin:plus-delta', name: 'Plus / Delta'});
      expect(board.defaultTimerSeconds).toBe(600);
    });

    it('takes the vote budget from the body, then the template, then 5', async () => {
      expect((await create({maxVotes: 8, templateId: 'builtin:pit-stop'})).maxVotes).toBe(8);
      expect((await create({templateId: 'builtin:pit-stop'})).maxVotes).toBe(3);
      expect((await create({templateId: 'builtin:plus-delta'})).maxVotes).toBe(5);
    });

    it('starts from the effective default when given neither', async () => {
      const board = await create();

      expect(shape(board)).toEqual([
        {prompt: 'Something we should try next sprint', title: 'Start'},
        {prompt: 'Something that costs us more than it gives', title: 'Stop'},
        {prompt: 'Something that works and must stay', title: 'Continue'},
      ]);
      expect(board.template).toEqual(startStopContinue);
      expect(board.defaultTimerSeconds).toBeNull();
    });

    it('builds a blank board from an empty column list, without template', async () => {
      const board = await create({columns: []});

      expect(board.columns).toEqual([]);
      expect(board.template).toBeNull();
      expect(board.defaultTimerSeconds).toBeNull();
    });

    it('keeps explicit columns without prompt or template', async () => {
      const board = await create({columns: ['A', 'B']});

      expect(shape(board)).toEqual([
        {prompt: null, title: 'A'},
        {prompt: null, title: 'B'},
      ]);
      expect(board.template).toBeNull();
    });

    it('answers 404 for a template of another team or organisation, deleted or unknown', async () => {
      const elsewhere = await createTemplate('Elsewhere', {}, await otherTeam());
      const deleted = await createTemplate('Deleted');
      const stranger = await harness.createUser(await harness.createOrg('Globex'), 'Mallory');
      const foreign = await harness.container.retroTemplateManager.create(
        stranger,
        await otherTeam(stranger, 'Globex team'),
        content('Foreign'),
      );

      await harness.container.retroTemplateManager.remove(admin, teamId, deleted.id);

      for (const templateId of [elsewhere.id, foreign.id, deleted.id, 'builtin:unknown']) {
        const response = await request(admin, `/teams/${teamId}/retros`, 'POST', {
          templateId,
          title: 'Sprint 42',
        });

        expect(response).toEqual({body: {message: 'Template not found'}, status: 404});
      }

      expect(await harness.container.retroManager.listByTeam(admin, teamId)).toEqual([]);
    });

    it('writes no retro when a column fails to be written', async () => {
      const {columnRepository: columns} = harness.container.retroManager as unknown as {
        columnRepository: ColumnRepository;
      };
      const original = columns.create.bind(columns);

      jest
        .spyOn(columns, 'create')
        .mockImplementationOnce(original)
        .mockRejectedValueOnce(new Error('disk full'));

      await expect(create({templateId: 'builtin:start-stop-continue'})).rejects.toThrow('disk full');

      const retros = await harness.container.db.selectFrom('retros').select('id').execute();
      const orphans = await harness.container.db.selectFrom('columns').select('id').execute();

      expect(retros).toEqual([]);
      expect(orphans).toEqual([]);
    });
  });

  it('never changes a retro when its template is edited, then deleted', async () => {
    const weekly = await createTemplate('Weekly', {timerSeconds: 120});
    const {id: retroId} = await harness.container.retroManager.create(admin, teamId, 'Sprint 42', {
      templateId: weekly.id,
    });
    const before = await harness.container.retroManager.getBoard(admin, retroId);

    await harness.container.retroTemplateManager.setDefault(admin, teamId, weekly.id);
    await harness.container.retroTemplateManager.update(
      admin,
      teamId,
      weekly.id,
      content('Renamed', {columns: [{prompt: 'Changed', title: 'Other'}], timerSeconds: 60}),
    );

    expect(await harness.container.retroManager.getBoard(admin, retroId)).toEqual(before);

    await harness.container.retroTemplateManager.remove(admin, teamId, weekly.id);

    const after = await harness.container.retroManager.getBoard(admin, retroId);

    expect(after).toEqual(before);
    expect(after.template).toEqual({id: weekly.id, name: 'Weekly'});
    expect(after.columns.map(({prompt, title}) => ({prompt, title}))).toEqual(weekly.columns);
  });

  it('returns the full template model', async () => {
    const created: TemplateModel = await createTemplate('Weekly');

    expect(Object.keys(created).sort()).toEqual([
      'columns',
      'description',
      'id',
      'maxVotes',
      'name',
      'scope',
      'timerSeconds',
      'updatedAt',
      'updatedBy',
    ]);
  });
});
