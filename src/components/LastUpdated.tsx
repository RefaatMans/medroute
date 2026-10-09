import { formatAgo } from '../lib/time';
import type { TimestampLike } from '../types';

/** "Last updated 3 min ago". Pass `now` from `useNow()` so it refreshes. */
export default function LastUpdated({ at, now, prefix = 'Last updated' }: { at: TimestampLike | null | undefined; now: Date; prefix?: string }) {
  if (!at) return <span className="text-xs text-slate-500">{prefix}: never</span>;
  const date = at.toDate();
  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString()} className="text-xs text-slate-500">
      {prefix} {formatAgo(date, now)}
    </time>
  );
}
