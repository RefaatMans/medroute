import { useEffect, useRef, useState } from 'react';
import { RELATIVE_TIME_REFRESH_MS } from '../config/ui';

/** Calls `callback` every `ms` milliseconds; `null` pauses. Always uses the latest callback. */
export function useInterval(callback: () => void, ms: number | null): void {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (ms === null) return;
    const id = window.setInterval(() => saved.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

/** The current time, refreshed periodically so "X min ago" labels stay correct. */
export function useNow(ms = RELATIVE_TIME_REFRESH_MS): Date {
  const [now, setNow] = useState(() => new Date());
  useInterval(() => setNow(new Date()), ms);
  return now;
}
