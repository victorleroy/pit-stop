import SQLite from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {CamelCasePlugin, Kysely, SqliteDialect} from 'kysely';
import type {Database} from '~/Db/schema';

export const createDb = (file: string): Kysely<Database> => {
  mkdirSync(dirname(file), {recursive: true});

  const sqlite = new SQLite(file);

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  return new Kysely<Database>({
    dialect: new SqliteDialect({database: sqlite}),
    plugins: [new CamelCasePlugin()],
  });
};

export type Db = Kysely<Database>;
