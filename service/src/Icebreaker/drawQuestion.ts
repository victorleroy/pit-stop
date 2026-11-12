import type {IcebreakerQuestion} from '~/Icebreaker/questions';

/**
 * Picks the next question for a team, uniformly among the best candidates still standing:
 * never asked and not held by another waiting room first, then a new cycle, then the whole
 * bank. Pure, so the order of fallbacks is tested without a database.
 */
export const drawIcebreakerQuestion = ({
  askedIds,
  bank,
  random,
  reservedIds,
}: {
  askedIds: ReadonlySet<string>;
  bank: readonly IcebreakerQuestion[];
  random: () => number;
  reservedIds: ReadonlySet<string>;
}): IcebreakerQuestion => {
  const active = bank.filter((question) => question.active);
  const fresh = active.filter(({id}) => !askedIds.has(id) && !reservedIds.has(id));
  const newCycle = active.filter(({id}) => !reservedIds.has(id));
  const candidates = [fresh, newCycle, active].find((list) => list.length > 0);

  if (!candidates) {
    throw new Error('The icebreaker bank has no active question');
  }

  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]!;
};
