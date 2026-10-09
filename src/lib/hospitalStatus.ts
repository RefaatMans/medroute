import type { Hospital } from '../types';
import { getCrowding } from './crowding';

export type OverviewStatus = 'ok' | 'strained' | 'unavailable';

/**
 * One-glance status for the admin map: unavailable = on diversion or no free beds at all;
 * strained = ER crowding high or ≤ 2 free beds in total; otherwise ok.
 */
export function overviewStatus(h: Hospital, now: Date): { status: OverviewStatus; reason: string } {
  const free = Object.values(h.bedSummary).reduce((n, c) => n + (c?.available ?? 0), 0);
  if (h.diverting) return { status: 'unavailable', reason: 'On diversion' };
  if (free === 0) return { status: 'unavailable', reason: 'No free beds' };
  if (getCrowding(h, now).level === 'high') return { status: 'strained', reason: `ER crowding high · ${free} beds free` };
  if (free <= 2) return { status: 'strained', reason: `Only ${free} bed${free === 1 ? '' : 's'} free` };
  return { status: 'ok', reason: `${free} beds free` };
}
