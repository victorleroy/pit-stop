import {useCallback, useEffect, useState} from 'react';
import type {DieRoll} from '@/api/types';

export const SPIN_MS = 1500;
export const HOLD_MS = 1000;

/**
 * The service's roll is final the moment it lands, but each face stays hidden while its die
 * spins, for the roller and everybody watching alike. The snapshot sent to whoever joins late
 * holds dice that landed long ago: they show at once. My own die keeps rolling until my roll
 * lands, and shows at once if it lands after its spin. Once it stops, my face stays on my own
 * die for a moment before it joins the order.
 */
export const useDiceSpin = (
  rolls: DieRoll[],
  {isSnapshot, reducedMotion}: {isSnapshot: boolean; reducedMotion: boolean},
) => {
  const [spinning, setSpinning] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<string>();
  const [seen, setSeen] = useState(rolls);
  const [toHold, setToHold] = useState<string>();
  const [hold, setHold] = useState<{until: number; userId: string}>();

  if (rolls !== seen) {
    setSeen(rolls);
    const known = new Set(seen.map(({userId}) => userId));
    const landed = rolls.filter(({userId}) => !known.has(userId) && !spinning[userId] && userId !== mine);

    if (mine && (!rolls.length || rolls.some(({userId}) => userId === mine))) setMine(undefined);
    if (isSnapshot) setToHold(undefined);

    if (!rolls.length) {
      setSpinning({});
      setToHold(undefined);
      setHold(undefined);
    } else if (!reducedMotion && !isSnapshot && landed.length) {
      const until = Date.now() + SPIN_MS;
      setSpinning({...spinning, ...Object.fromEntries(landed.map(({userId}) => [userId, until]))});
    }
  }

  if (toHold && !isSnapshot && toHold !== mine && !spinning[toHold] && rolls.some(({userId}) => userId === toHold)) {
    setToHold(undefined);
    setHold({until: Date.now() + HOLD_MS, userId: toHold});
  }

  useEffect(() => {
    if (!hold) return;

    const timer = setTimeout(() => setHold(undefined), Math.max(0, hold.until - Date.now()));
    return () => clearTimeout(timer);
  }, [hold]);

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
      setToHold(userId);
      setSpinning((current) => ({...current, [userId]: Date.now() + SPIN_MS}));
    },
    [reducedMotion],
  );

  const stop = useCallback((userId: string) => {
    setMine(undefined);
    setToHold(undefined);
    setSpinning((current) => {
      const {[userId]: _stopped, ...rest} = current;
      return rest;
    });
  }, []);

  return {
    /** My roll, shown on my own die after its spin and kept out of the order meanwhile. */
    held: hold && rolls.find(({userId}) => userId === hold.userId),
    settled: rolls.filter(({userId}) => !spinning[userId] && userId !== hold?.userId),
    spin,
    spinningIds: mine && !spinning[mine] ? [...Object.keys(spinning), mine] : Object.keys(spinning),
    stop,
  };
};
