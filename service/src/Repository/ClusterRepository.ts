import type {Db} from '~/Db/connection';
import type {ClusterRow} from '~/Repository/BoardRepository';

export class ClusterRepository {
  public constructor(private readonly db: Db) {}

  public async findOneById(retroId: string, clusterId: string): Promise<ClusterRow | undefined> {
    return this.db
      .selectFrom('clusters')
      .select(['id', 'columnId', 'title'])
      .where('retroId', '=', retroId)
      .where('id', '=', clusterId)
      .executeTakeFirst();
  }

  public async create(input: {columnId: string; id: string; retroId: string}): Promise<void> {
    await this.db.insertInto('clusters').values({...input, title: null}).execute();
  }

  public async rename(retroId: string, clusterId: string, title: string): Promise<void> {
    await this.db
      .updateTable('clusters')
      .set({title})
      .where('retroId', '=', retroId)
      .where('id', '=', clusterId)
      .execute();
  }

  /**
   * A cluster of one is just a note: whatever left it — a move, a delete, a regroup — the
   * shell is dissolved, so every card on the board is either a note or a real cluster.
   */
  public async dissolveUndersized(retroId: string): Promise<void> {
    const undersized = await this.db
      .selectFrom('clusters')
      .leftJoin('notes', (join) =>
        join
          .onRef('notes.clusterId', '=', 'clusters.id')
          .onRef('notes.columnId', '=', 'clusters.columnId'),
      )
      .select('clusters.id')
      .where('clusters.retroId', '=', retroId)
      .groupBy('clusters.id')
      .having((eb) => eb.fn.count('notes.id'), '<', 2)
      .execute();
    const ids = undersized.map(({id}) => id);

    if (!ids.length) {
      return;
    }

    await this.db
      .updateTable('notes')
      .set({clusterId: null})
      .where('retroId', '=', retroId)
      .where('clusterId', 'in', ids)
      .execute();
    await this.db
      .deleteFrom('clusters')
      .where('retroId', '=', retroId)
      .where('id', 'in', ids)
      .execute();
  }

  public async remove(retroId: string, clusterId: string): Promise<void> {
    await this.db
      .deleteFrom('clusters')
      .where('retroId', '=', retroId)
      .where('id', '=', clusterId)
      .execute();
  }
}
