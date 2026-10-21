import type {Db} from '~/Db/connection';

export class VoteRepository {
  public constructor(private readonly db: Db) {}

  /** A counter reaching zero is deleted, never stored as 0 (BEHAVIOUR.md section 6). */
  public async addToCount(
    retroId: string,
    userId: string,
    targetId: string,
    delta: number,
  ): Promise<void> {
    await this.db
      .insertInto('votes')
      .values({count: delta, retroId, targetId, userId})
      .onConflict((oc) =>
        oc.columns(['retroId', 'userId', 'targetId']).doUpdateSet((eb) => ({
          count: eb('votes.count', '+', delta),
        })),
      )
      .execute();
  }

  public async remove(retroId: string, userId: string, targetId: string): Promise<void> {
    await this.db
      .deleteFrom('votes')
      .where('retroId', '=', retroId)
      .where('userId', '=', userId)
      .where('targetId', '=', targetId)
      .execute();
  }

  public async removeAllByRetroId(retroId: string): Promise<void> {
    await this.db.deleteFrom('votes').where('retroId', '=', retroId).execute();
  }
}
