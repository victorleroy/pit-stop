import SQLite from 'better-sqlite3';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sql} from 'kysely';
import {createDb} from '~/Db/connection';
import {migrate} from '~/Db/migrate';

const MIGRATIONS = join(__dirname, '../../src/Db/migrations');
const ALL = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
const REBUILD = ALL.find((name) => name.endsWith('_retro_phases.sql'))!;
const BEFORE = ALL.filter((name) => name < REBUILD);

/** ADR 0005: the one rebuild of retros keeps every board, and a broken rebuild keeps nothing. */
describe('migrations', () => {
  let directory: string;
  let file: string;

  const migrationsUpTo = (names: string[]): string => {
    const target = join(directory, `migrations-${names.length}`);

    mkdirSync(target);
    names.forEach((name) => copyFileSync(join(MIGRATIONS, name), join(target, name)));

    return target;
  };

  const populate = (): void => {
    const sqlite = new SQLite(file);
    const now = '2026-10-01T10:00:00.000Z';
    const run = (sql: string, ...values: unknown[]) => sqlite.prepare(sql).run(...values);

    run('INSERT INTO organizations (id, name, status, created_at) VALUES (?, ?, ?, ?)', 'org', 'Acme', 'active', now);
    run('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)', 'usr', 'v@acme.test', 'Victor', now);
    run('INSERT INTO teams (id, org_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)', 'team', 'org', 'Platform', 'usr', now);

    for (const [id, phase] of [['r1', 'VOTE'], ['r2', 'ARCHIVED']] as const) {
      run(
        `INSERT INTO retros (id, org_id, team_id, title, phase, created_by, facilitator_id, max_votes,
                             timer_ends_at, timer_remaining_ms, created_at, timer_total_ms,
                             template_id, template_name, default_timer_seconds)
         VALUES (?, 'org', 'team', ?, ?, 'usr', 'usr', 3, NULL, 4000, ?, 60000,
                 'builtin:4ls', 'Four Ls', 420)`,
        id,
        `Retro ${id}`,
        phase,
        now,
      );
      run(
        'INSERT INTO columns (id, retro_id, title, position, prompt) VALUES (?, ?, ?, 0, ?)',
        `${id}-c`,
        id,
        'Liked',
        'What went well?',
      );
      run('INSERT INTO clusters (id, retro_id, column_id, title) VALUES (?, ?, ?, ?)', `${id}-k`, id, `${id}-c`, 'Group');
      run(
        `INSERT INTO notes (id, retro_id, column_id, cluster_id, author_id, text, revealed, created_at)
         VALUES (?, ?, ?, ?, 'usr', 'note', 1, ?)`,
        `${id}-n`,
        id,
        `${id}-c`,
        `${id}-k`,
        now,
      );
      run('INSERT INTO votes (retro_id, user_id, target_id, count) VALUES (?, ?, ?, 2)', id, 'usr', `${id}-k`);
      run(
        `INSERT INTO actions (id, org_id, team_id, retro_id, text, status, created_at)
         VALUES (?, 'org', 'team', ?, 'Fix the CI', 'OPEN', ?)`,
        `${id}-a`,
        id,
        now,
      );
    }

    sqlite.close();
  };

  const counts = (sqlite: SQLite.Database): Record<string, number> =>
    Object.fromEntries(
      ['retros', 'columns', 'clusters', 'notes', 'votes', 'actions'].map((table) => [
        table,
        (sqlite.prepare(`SELECT count(*) AS total FROM ${table}`).get() as {total: number}).total,
      ]),
    );

  const indexes = (sqlite: SQLite.Database) =>
    ['retros_team', 'retros_org'].map((name) => sqlite.pragma(`index_xinfo(${name})`));

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'pit-stop-migrations-'));
    file = join(directory, 'pit-stop.db');
  });

  afterEach(() => rmSync(directory, {force: true, recursive: true}));

  it('rebuilds retros without losing a board, a link or an index', async () => {
    migrate(file, migrationsUpTo(BEFORE));
    populate();

    const before = new SQLite(file);
    const countsBefore = counts(before);
    const retrosBefore = before.prepare('SELECT * FROM retros ORDER BY id').all();
    const indexesBefore = indexes(before);
    const columnsBefore = (before.pragma('table_info(retros)') as {name: string}[]).map(({name}) => name);

    before.close();

    migrate(file, MIGRATIONS);

    const after = new SQLite(file);

    expect(counts(after)).toEqual(countsBefore);
    expect(after.prepare('SELECT template_id, template_name, default_timer_seconds FROM retros').all()).toEqual([
      {default_timer_seconds: 420, template_id: 'builtin:4ls', template_name: 'Four Ls'},
      {default_timer_seconds: 420, template_id: 'builtin:4ls', template_name: 'Four Ls'},
    ]);
    expect(after.prepare("SELECT prompt FROM columns WHERE id = 'r1-c'").get()).toEqual({prompt: 'What went well?'});
    expect(after.prepare('SELECT * FROM retros ORDER BY id').all()).toEqual(
      retrosBefore.map((row) => expect.objectContaining(row as object)),
    );
    expect(after.prepare('SELECT retro_id FROM actions ORDER BY id').all()).toEqual([
      {retro_id: 'r1'},
      {retro_id: 'r2'},
    ]);
    expect(after.pragma('foreign_key_check')).toEqual([]);
    expect(indexes(after)).toEqual(indexesBefore);

    const columnsAfter = (after.pragma('table_info(retros)') as {name: string}[]).map(({name}) => name);

    expect(columnsAfter).toEqual(expect.arrayContaining(columnsBefore));
    expect(
      after.prepare("SELECT action_review, icebreaker_answers_revealed FROM retros WHERE id = 'r1'").get(),
    ).toEqual({action_review: 1, icebreaker_answers_revealed: 0});

    after
      .prepare(
        `INSERT INTO retros (id, org_id, team_id, title, created_by, facilitator_id, created_at)
         VALUES ('r3', 'org', 'team', 'New', 'usr', 'usr', '2026-11-11T10:00:00.000Z')`,
      )
      .run();
    expect(after.prepare("SELECT phase FROM retros WHERE id = 'r3'").get()).toEqual({phase: 'LOBBY'});
    after.close();

    const backup = `${file}.bak-${REBUILD.replace(/\.sql$/, '')}`;

    expect(existsSync(backup)).toBe(true);

    const copy = new SQLite(backup, {readonly: true});

    expect(counts(copy)).toEqual(countsBefore);
    copy.close();

    const db = createDb(file);
    const {rows} = await sql<{foreignKeys: number}>`PRAGMA foreign_keys`.execute(db);

    expect(rows).toEqual([{foreignKeys: 1}]);
    await db.destroy();
  });

  it('takes no backup of a fresh database', () => {
    migrate(file, MIGRATIONS);

    expect(readdirSync(directory).filter((name) => name.includes('.bak-'))).toEqual([]);
  });

  it('rolls back a rebuild that leaves a broken foreign key, and fails the boot', () => {
    const target = migrationsUpTo(BEFORE);

    migrate(file, target);
    populate();
    writeFileSync(
      join(target, `${REBUILD.slice(0, 3)}_broken.sql`),
      "-- migrate: foreign_keys=off\nDELETE FROM teams;\n",
    );

    expect(() => migrate(file, target)).toThrow('broken foreign key');

    const sqlite = new SQLite(file);

    expect((sqlite.prepare('SELECT count(*) AS total FROM teams').get() as {total: number}).total).toBe(1);
    expect(sqlite.prepare('SELECT name FROM migrations WHERE name LIKE ?').all('%_broken.sql')).toEqual([]);
    sqlite.close();
  });
});
