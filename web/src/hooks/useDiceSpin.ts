import {useCallback, useEffect, useState} from 'react';
import type {DieRoll} from '@/api/types';

export const SPIN_MS = 3000;

/**
 * The service's roll is final the moment it lands, but each face stays hidden while its die
 * spins, for the roller and everybody watching alike. A batch of several new rolls is the
 * snapshot sent to whoever joins late: those dice landed long ago and show at once.
 */
export const useDiceSpin = (rolls: DieRoll[], {reducedMotion}: {reducedMotion: boolean}) => {
  const [spinning, setSpinning] = useState<Record<string, number>>({});
  const [seen, setSeen] = useState(rolls);

  if (rolls !== seen) {
    setSeen(rolls);
    const known = new Set(seen.map(({userId}) => userId));
    const landed = rolls.filter(({userId}) => !known.has(userId));

    if (!rolls.length) setSpinning({});
    else if (!reducedMotion && landed.length === 1 && !spinning[landed[0].userId]) {
      setSpinning({...spinning, [landed[0].userId]: Date.now() + SPIN_MS});
    }
  }

  useEffect(() => {
    const timers = Object.entries(spinning).map(([userId, until]) =>
      setTimeout(
        () =>
          setSpinning((current) => {
            const {[userId]: _settled, ...rest} = current;
            return rest;
          }),
        Math.max(0, until - Date.now()),
      ),
    );

    return () => timers.forEach(clearTimeout);
  }, [spinning]);

  const spin = useCallback(
    (userId: string) => {
      if (!reducedMotion) setSpinning((current) => ({...current, [userId]: Date.now() + SPIN_MS}));
    },
    [reducedMotion],
  );

  const stop = useCallback(
    (userId: string) =>
      setSpinning((current) => {
        const {[userId]: _stopped, ...rest} = current;
        return rest;
      }),
    [],
  );

  return {
    isSpinning: (userId?: string) => Boolean(userId && spinning[userId]),
    settled: rolls.filter(({userId}) => !spinning[userId]),
    spin,
    spinningIds: Object.keys(spinning),
    stop,
  };
};
