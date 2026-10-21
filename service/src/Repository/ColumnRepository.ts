import type {Db} from '~/Db/connection';
import type {ColumnRow} from '~/Repository/BoardRepository';

export class ColumnRepository {
  public constructor(private readonly db: Db) {}

  public async findOneById(retroId: string, columnId: string): Promise<ColumnRow | undefined> {
    return this.db
      .selectFrom('columns')
      .select(['id', 'title', 'position'])
      .where('retroId', '=', retroId)
      .where('id', '=', columnId)
      .executeTakeFirst();
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

  public async create(input: {id: string; position: number; retroId: string; title: string}) {
    await this.db.insertInto('columns').values(input).execute();
  }

  public async rename(retroId: string, columnId: string, title: string): Promise<void> {
    await this.db
      .updateTable('columns')
      .set({title})
      .where('retroId', '=', retroId)
      .where('id', '=', columnId)
      .execute();
  }

  public async remove(retroId: string, columnId: string): Promise<void> {
    await this.db
      .deleteFrom('columns')
      .where('retroId', '=', retroId)
      .where('id', '=', columnId)
      .execute();
  }
}
