import type {Db} from '~/Db/connection';
import type {ColumnRow} from '~/Repository/BoardRepository';

export class ColumnRepository {
  public constructor(private readonly db: Db) {}

  public async findOneById(retroId: string, columnId: string): Promise<ColumnRow | undefined> {
    return this.db
      .selectFrom('columns')
      .select(['id', 'title', 'position', 'prompt'])
      .where('retroId', '=', retroId)
      .where('id', '=', columnId)
      .executeTakeFirst();
  }

  public async findAllByRetroId(retroId: string): Promise<ColumnRow[]> {
    return this.db
      .selectFrom('columns')
      .select(['id', 'title', 'position', 'prompt'])
      .where('retroId', '=', retroId)
      .orderBy('position')
      .execute();
  }

  public async findIdsByRetroId(retroId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('columns')
      .select('id')
      .where('retroId', '=', retroId)
      .execute();

    return rows.map(({id}) => id);
  }

  public async countByRetroId(retroId: string): Promise<number> {
    const row = await this.db
      .selectFrom('columns')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('retroId', '=', retroId)
      .executeTakeFirst();

    return Number(row?.total ?? 0);
  }

  /** After the last column, not after the count: a deleted column leaves a gap behind. */
  public async nextPosition(retroId: string): Promise<number> {
    const row = await this.db
      .selectFrom('columns')
      .select((eb) => eb.fn.max<number | null>('position').as('last'))
      .where('retroId', '=', retroId)
      .executeTakeFirst();

    return row?.last === null || row?.last === undefined ? 0 : Number(row.last) + 1;
  }

  /** Takes the caller's transaction when the column is part of a larger write. */
  public async create(
    input: {id: string; position: number; prompt?: string | null; retroId: string; title: string},
    executor: Db = this.db,
  ) {
    await executor.insertInto('columns').values(input).execute();
  }

  public async update(
    retroId: string,
    columnId: string,
    changes: {prompt?: string | null; title?: string},
  ): Promise<void> {
    await this.db
      .updateTable('columns')
      .set(changes)
      .where('retroId', '=', retroId)
      .where('id', '=', columnId)
      .execute();
  }

  public async reorder(retroId: string, columnIds: string[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      for (const [position, id] of columnIds.entries()) {
        await trx
          .updateTable('columns')
          .set({position})
          .where('retroId', '=', retroId)
          .where('id', '=', id)
          .execute();
      }
    });
  }

  public async remove(retroId: string, columnId: string): Promise<void> {
    await this.db
      .deleteFrom('columns')
      .where('retroId', '=', retroId)
      .where('id', '=', columnId)
      .execute();
  }
}
