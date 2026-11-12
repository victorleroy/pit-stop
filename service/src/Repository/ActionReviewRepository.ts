import type {Db} from '~/Db/connection';
import type {ActionReviewOutcome} from '~/Db/schema';
import type {ScopedDb} from '~/Security/ScopedDb';

export interface ActionReviewRecord {
  comment: string | null;
  outcome: ActionReviewOutcome;
  reviewedAt: string;
  reviewedBy: string | null;
}

export interface ReviewCounts {
  createdAt: string;
  done: number;
  dropped: number;
  kept: number;
  retroId: string;
  retroTitle: string;
}

/** Writes take an optional executor so a manager can run them inside its own transaction. */
export class ActionReviewRepository {
  public constructor(private readonly db: Db) {}

  public async findOne(
    scoped: ScopedDb,
    actionId: string,
    retroId: string,
  ): Promise<ActionReviewRecord | undefined> {
    return scoped
      .actionReviews()
      .select([
        'actionReviews.comment',
        'actionReviews.outcome',
        'actionReviews.reviewedAt',
        'actionReviews.reviewedBy',
      ])
      .where('actionReviews.actionId', '=', actionId)
      .where('actionReviews.retroId', '=', retroId)
      .executeTakeFirst();
  }

  /** One outcome per action and retro: a second one replaces the first. */
  public async upsert(
    input: {
      actionId: string;
      comment: string | null;
      id: string;
      orgId: string;
      outcome: ActionReviewOutcome;
      retroId: string;
      reviewedAt: string;
      reviewedBy: string;
      teamId: string;
    },
    executor: Db = this.db,
  ): Promise<void> {
    await executor
      .insertInto('actionReviews')
      .values(input)
      .onConflict((conflict) =>
        conflict.columns(['actionId', 'retroId']).doUpdateSet({
          comment: input.comment,
          outcome: input.outcome,
          reviewedAt: input.reviewedAt,
          reviewedBy: input.reviewedBy,
        }),
      )
      .execute();
  }

  public async updateComment(
    actionId: string,
    retroId: string,
    comment: string | null,
    executor: Db = this.db,
  ): Promise<void> {
    await executor
      .updateTable('actionReviews')
      .set({comment})
      .where('actionId', '=', actionId)
      .where('retroId', '=', retroId)
      .execute();
  }

  public async remove(actionId: string, retroId: string, executor: Db = this.db): Promise<void> {
    await executor
      .deleteFrom('actionReviews')
      .where('actionId', '=', actionId)
      .where('retroId', '=', retroId)
      .execute();
  }

  /** Outcome counts of the team's most recent retros that reviewed anything, newest first. */
  public async trendByTeam(scoped: ScopedDb, teamId: string, limit: number): Promise<ReviewCounts[]> {
    return this.counts(scoped)
      .where('actionReviews.teamId', '=', teamId)
      .orderBy('retros.createdAt', 'desc')
      .limit(limit)
      .execute();
  }

  public async countsByRetro(scoped: ScopedDb, retroId: string): Promise<ReviewCounts | undefined> {
    return this.counts(scoped).where('actionReviews.retroId', '=', retroId).executeTakeFirst();
  }

  private counts(scoped: ScopedDb) {
    return scoped
      .actionReviews()
      .innerJoin('retros', 'retros.id', 'actionReviews.retroId')
      .select((eb) => [
        'retros.id as retroId',
        'retros.title as retroTitle',
        'retros.createdAt',
        eb.fn
          .sum<number>(eb.case().when('actionReviews.outcome', '=', 'DONE').then(1).else(0).end())
          .as('done'),
        eb.fn
          .sum<number>(eb.case().when('actionReviews.outcome', '=', 'DROPPED').then(1).else(0).end())
          .as('dropped'),
        eb.fn
          .sum<number>(eb.case().when('actionReviews.outcome', '=', 'KEPT').then(1).else(0).end())
          .as('kept'),
      ])
      .groupBy(['retros.id', 'retros.title', 'retros.createdAt']);
  }
}
