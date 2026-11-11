import {useCallback, useEffect, useState} from 'react';
import type {DieRoll} from '@/api/types';

export const SPIN_MS = 3000;

/**
 * The service's roll is final the moment it lands, but each face stays hidden while its die
 * spins, for the roller and everybody watching alike. The snapshot sent to whoever joins late
 * holds dice that landed long ago: they show at once. My own die keeps rolling until my roll
 * lands, and shows at once if it lands after its spin.
 */
export const useDiceSpin = (
  rolls: DieRoll[],
  {isSnapshot, reducedMotion}: {isSnapshot: boolean; reducedMotion: boolean},
) => {
  const [spinning, setSpinning] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<string>();
  const [seen, setSeen] = useState(rolls);

  if (rolls !== seen) {
    setSeen(rolls);
    const known = new Set(seen.map(({userId}) => userId));
    const landed = rolls.filter(({userId}) => !known.has(userId) && !spinning[userId] && userId !== mine);

    if (mine && (!rolls.length || rolls.some(({userId}) => userId === mine))) setMine(undefined);

    if (!rolls.length) setSpinning({});
    else if (!reducedMotion && !isSnapshot && landed.length) {
      const until = Date.now() + SPIN_MS;
      setSpinning({...spinning, ...Object.fromEntries(landed.map(({userId}) => [userId, until]))});
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
      if (reducedMotion) return;

      setMine(userId);
      setSpinning((current) => ({...current, [userId]: Date.now() + SPIN_MS}));
    },
    [reducedMotion],
  );

  const stop = useCallback((userId: string) => {
    setMine(undefined);
    setSpinning((current) => {
      const {[userId]: _stopped, ...rest} = current;
      return rest;
    });
  }, []);

  return {
    settled: rolls.filter(({userId}) => !spinning[userId]),
    spin,
    spinningIds: mine && !spinning[mine] ? [...Object.keys(spinning), mine] : Object.keys(spinning),
    stop,
  };
};
