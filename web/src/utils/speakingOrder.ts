import type {DieRoll, Participant} from '@/api/types';

/**
 * The rolls arrive ranked by the service, which alone knows how ties were broken. Whoever is
 * in the room without a roll is still to roll; somebody who left drops out of the wait.
 */
export const speakingOrder = (rolls: DieRoll[], participants: Participant[]) => {
  const rolled = new Set(rolls.map(({userId}) => userId));
  const waiting = participants.filter(({userId}) => !rolled.has(userId));

  return {isComplete: rolls.length > 0 && waiting.length === 0, order: rolls, waiting};
};
