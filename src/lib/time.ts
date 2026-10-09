/** "just now", "5 min ago", "2 h ago", "3 days ago". */
export function formatAgo(then: Date, now: Date): string {
  const sec = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Compact duration: "< 1 min", "12 min", "3 h 05 min", "2 d". */
export function formatDuration(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')} min`;
  return `${Math.floor(h / 24)} d`;
}

/** Time left until `due`: "6 min", "< 1 min", or "overdue 3 min". */
export function formatCountdown(dueMs: number, nowMs: number): string {
  const diffMin = (dueMs - nowMs) / 60_000;
  if (diffMin >= 1) return `${Math.round(diffMin)} min`;
  if (diffMin > -1) return '< 1 min';
  return `overdue ${Math.round(-diffMin)} min`;
}

/** Natural sort for bed labels so "GEN-2" comes before "GEN-10". */
export function compareLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}
