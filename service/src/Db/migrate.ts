import SQLite from 'better-sqlite3';
import {existsSync, mkdirSync, readFileSync, readdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {config} from '~/config';
import {logger} from '~/logger';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * A file starting with this line rebuilds a table. SQLite ignores `PRAGMA foreign_keys` inside
 * a transaction, and dropping a parent table with the keys on cascades into every child, so
 * such a file runs with the keys off, after a backup, and is checked before it commits.
 */
const FOREIGN_KEYS_OFF = /^--\s*migrate:\s*foreign_keys=off\s*$/;

const backupPath = (file: string, name: string): string => {
  const base = `${file}.bak-${name.replace(/\.sql$/, '')}`;

  return existsSync(base) ? `${base}-${Date.now()}` : base;
};

export const migrate = (file: string, directory: string = MIGRATIONS_DIR): void => {
  // First boot on a fresh checkout, or on an empty volume: the directory is ours to make.
  mkdirSync(dirname(file), {recursive: true});

  const sqlite = new SQLite(file);

  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');

    const applied = new Set(
      sqlite.prepare('SELECT name FROM migrations').all().map((row) => (row as {name: string}).name),
    );

    const pending = readdirSync(directory)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .filter((name) => !applied.has(name));

    for (const name of pending) {
      const sql = readFileSync(join(directory, name), 'utf8');
      const rebuilds = FOREIGN_KEYS_OFF.test(sql.split('\n', 1)[0] ?? '');
      const run = sqlite.transaction(() => {
        sqlite.exec(sql);

        // Checked before the commit, so a rebuild that loses a parent row is rolled back.
        const orphans = rebuilds ? (sqlite.pragma('foreign_key_check') as unknown[]) : [];

        if (orphans.length) {
          throw new Error(
            `Migration ${name} leaves ${orphans.length} broken foreign key(s): ${JSON.stringify(orphans.slice(0, 5))}`,
          );
        }

        sqlite
          .prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)')
          .run(name, new Date().toISOString());
      });

      if (!rebuilds) {
        run();
        logger.info({migration: name}, 'Migration applied');
        continue;
      }

      // A fresh database has nothing to lose; any other gets a copy it can be restored from,
      // since there is no downgrade (ADR 0005).
      if (applied.size) {
        const backup = backupPath(file, name);

        sqlite.prepare('VACUUM INTO ?').run(backup);
        logger.info({backup, migration: name}, 'Database backed up before a table rebuild');
      }

      sqlite.pragma('foreign_keys = OFF');

      try {
        run();
      } finally {
        sqlite.pragma('foreign_keys = ON');
      }

      logger.info({migration: name}, 'Migration applied');
    }
  } finally {
    sqlite.close();
  }
};

if (require.main === module) {
  migrate(config.databaseFile);
}
