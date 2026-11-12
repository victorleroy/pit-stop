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

export interface PresenceSlot extends Participant {
  /** 1 speaks first; only once the participant's die settled. */
  rank?: number;
  value?: number;
}

/**
 * The presence in speaking order: whoever rolled first, by the service's ranking, then whoever
 * has not rolled yet as they came. Ranks count the people in the room only, so nobody waits for
 * somebody who left.
 */
export const presenceOrder = (participants: Participant[], rolls: DieRoll[]): PresenceSlot[] => {
  const present = new Map(participants.map((participant) => [participant.userId, participant]));
  const ranked = rolls
    .filter(({userId}) => present.has(userId))
    .map(({userId, value}, index) => ({...(present.get(userId) as Participant), rank: index + 1, value}));
  const rolled = new Set(ranked.map(({userId}) => userId));

  return [...ranked, ...participants.filter(({userId}) => !rolled.has(userId))];
};
