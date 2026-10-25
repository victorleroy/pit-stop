import SQLite from 'better-sqlite3';
import {mkdirSync, readFileSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {config} from '~/config';
import {logger} from '~/logger';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

export const migrate = (file: string): void => {
  // First boot on a fresh checkout, or on an empty volume: the directory is ours to make.
  mkdirSync(dirname(file), {recursive: true});

  const sqlite = new SQLite(file);

  sqlite.pragma('journal_mode = WAL');
  sqlite.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');

  const applied = new Set(
    sqlite.prepare('SELECT name FROM migrations').all().map((row) => (row as {name: string}).name),
  );

  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) => !applied.has(name));

  for (const name of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');

    sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)')
        .run(name, new Date().toISOString());
    })();

    logger.info({migration: name}, 'Migration applied');
  }

  sqlite.close();
};

if (require.main === module) {
  migrate(config.databaseFile);
}
