import type {Db} from '~/Db/connection';

export interface NoteOwnerRow {
  authorId: string;
  clusterId: string | null;
  columnId: string;
  id: string;
  revealed: number;
  text: string;
}

export class NoteRepository {
  public constructor(private readonly db: Db) {}

  public async findOneById(retroId: string, noteId: string): Promise<NoteOwnerRow | undefined> {
    return this.db
      .selectFrom('notes')
      .select(['id', 'authorId', 'clusterId', 'columnId', 'revealed', 'text'])
      .where('retroId', '=', retroId)
      .where('id', '=', noteId)
      .executeTakeFirst();
  }

  public async create(input: {
    authorId: string;
    columnId: string;
    id: string;
    retroId: string;
    text: string;
  }): Promise<void> {
    await this.db
      .insertInto('notes')
      .values({...input, createdAt: new Date().toISOString(), revealed: 0})
      .execute();
  }

  public async update(
    retroId: string,
    noteId: string,
    changes: {clusterId?: string | null; columnId?: string; text?: string},
  ): Promise<void> {
    if (!Object.keys(changes).length) {
      return;
    }

    await this.db
      .updateTable('notes')
      .set(changes)
      .where('retroId', '=', retroId)
      .where('id', '=', noteId)
      .execute();
  }

  public async remove(retroId: string, noteId: string): Promise<void> {
    await this.db
      .deleteFrom('notes')
      .where('retroId', '=', retroId)
      .where('id', '=', noteId)
      .execute();
  }

  /** Sharing is author-global and idempotent (BEHAVIOUR.md section 4). */
  public async setRevealedByAuthor(
    retroId: string,
    authorId: string,
    revealed: boolean,
  ): Promise<void> {
    await this.db
      .updateTable('notes')
      .set({revealed: revealed ? 1 : 0})
      .where('retroId', '=', retroId)
      .where('authorId', '=', authorId)
      .execute();
  }

  public async clearClusterFor(retroId: string, noteIds: string[]): Promise<void> {
    if (!noteIds.length) {
      return;
    }

    await this.db
      .updateTable('notes')
      .set({clusterId: null})
      .where('retroId', '=', retroId)
      .where('id', 'in', noteIds)
      .execute();
  }
}
