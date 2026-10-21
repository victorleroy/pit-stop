import {useEffect, useRef} from 'react';

/**
 * `TextField` drops the `autoFocus` prop on the way to the input, so a dialog opens with
 * the focus on its own paper and the first thing typed goes nowhere. Focus it by hand.
 */
export const useAutoFocus = (isOpen: boolean) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    // The dialog mounts its content through a transition; the ref lands a frame later.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return inputRef;
};
