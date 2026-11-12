import type {Db} from '~/Db/connection';

/**
 * Answers hang under a retro like notes do: the caller has resolved the retro through the
 * scoped accessor first, so these writes need no org filter (ScopedDb header).
 */
export class IcebreakerAnswerRepository {
  public constructor(private readonly db: Db) {}

  /** One answer per person, hidden when written: a second one replaces the text, keeps its place and its visibility. */
  public async upsert(retroId: string, userId: string, text: string): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .insertInto('icebreakerAnswers')
      .values({createdAt: now, retroId, text, updatedAt: now, userId})
      .onConflict((conflict) =>
        conflict.columns(['retroId', 'userId']).doUpdateSet({text, updatedAt: now}),
      )
      .execute();
  }

  /** False when the person has no answer to show or hide. */
  public async setRevealed(retroId: string, userId: string, revealed: boolean): Promise<boolean> {
    const result = await this.db
      .updateTable('icebreakerAnswers')
      .set({revealed: revealed ? 1 : 0})
      .where('retroId', '=', retroId)
      .where('userId', '=', userId)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  }

  public async remove(retroId: string, userId: string): Promise<void> {
    await this.db
      .deleteFrom('icebreakerAnswers')
      .where('retroId', '=', retroId)
      .where('userId', '=', userId)
      .execute();
  }
}
