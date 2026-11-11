import type {Db} from '~/Db/connection';

/**
 * Answers hang under a retro like notes do: the caller has resolved the retro through the
 * scoped accessor first, so these writes need no org filter (ScopedDb header).
 */
export class IcebreakerAnswerRepository {
  public constructor(private readonly db: Db) {}

  /** One answer per person: a second one replaces the text and keeps its place in the order. */
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

  public async remove(retroId: string, userId: string): Promise<void> {
    await this.db
      .deleteFrom('icebreakerAnswers')
      .where('retroId', '=', retroId)
      .where('userId', '=', userId)
      .execute();
  }

  public async removeAllByRetroId(retroId: string): Promise<void> {
    await this.db.deleteFrom('icebreakerAnswers').where('retroId', '=', retroId).execute();
  }
}
