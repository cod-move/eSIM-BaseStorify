import { useCallback, useEffect, useState } from 'react';

/**
 * The pause before a reset link can be asked for again, so a tap that seems
 * to do nothing is not repeated straight away. The store's own limits still
 * apply, and a refusal's wait replaces this one.
 */
export const RESEND_PAUSE_SECONDS = 60;

/**
 * A countdown in whole seconds, for a "Send a new link" that waits before it
 * can be used again. `secondsLeft` is 0 when there is nothing to wait for;
 * `wait` starts a new countdown in place of the one running.
 */
export function useWait(): { secondsLeft: number; wait: (seconds: number) => void } {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(1000, until - now));
    return () => clearTimeout(timer);
  }, [until, now]);

  const wait = useCallback((seconds: number) => {
    const start = Date.now();
    setNow(start);
    setUntil(start + seconds * 1000);
  }, []);

  return { secondsLeft: Math.max(0, Math.ceil((until - now) / 1000)), wait };
}
