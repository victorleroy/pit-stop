import type {IcebreakerQuestion} from '~/Icebreaker/questions';

/**
 * Picks the next question for a team, uniformly among the best candidates still standing:
 * never asked and not held by another waiting room first, then a new cycle, and the current
 * question only when the bank has nothing else. Pure, so the order of fallbacks is tested
 * without a database.
 */
export const drawIcebreakerQuestion = ({
  askedIds,
  bank,
  currentId,
  random,
  reservedIds,
}: {
  askedIds: ReadonlySet<string>;
  bank: readonly IcebreakerQuestion[];
  currentId: string | null;
  random: () => number;
  reservedIds: ReadonlySet<string>;
}): IcebreakerQuestion => {
  const active = bank.filter((question) => question.active);
  const notCurrent = active.filter(({id}) => id !== currentId);
  const fresh = notCurrent.filter(({id}) => !askedIds.has(id) && !reservedIds.has(id));
  const newCycle = notCurrent.filter(({id}) => !reservedIds.has(id));
  const candidates = [fresh, newCycle, notCurrent, active].find((list) => list.length > 0);

  if (!candidates) {
    throw new Error('The icebreaker bank has no active question');
  }

  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]!;
};
