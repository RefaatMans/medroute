import {
  CAMERA_STALE_MINUTES,
  HIGH_MIN_RATIO,
  LOW_MAX_RATIO,
  MANUAL_COUNT_STALE_MINUTES,
} from '../config/crowding';
import { STALE_CROWD_RATIO } from '../config/routing';
import type { CrowdingLevel, ErCountSource, Hospital } from '../types';

/** People waiting ÷ comfort capacity. A capacity of 0 counts any waiting person as overcrowded. */
export function crowdRatio(count: number, comfortCapacity: number): number {
  if (comfortCapacity > 0) return count / comfortCapacity;
  return count > 0 ? Infinity : 0;
}

export function crowdingLevel(ratio: number): CrowdingLevel {
  if (ratio < LOW_MAX_RATIO) return 'low';
  if (ratio <= HIGH_MIN_RATIO) return 'medium';
  return 'high';
}

/** Whether the ER count is too old to trust (spec 4.7). A missing timestamp is always stale. */
export function isCountStale(updatedAt: Date | null, source: ErCountSource, now: Date): boolean {
  if (!updatedAt) return true;
  const limitMin = source === 'camera' ? CAMERA_STALE_MINUTES : MANUAL_COUNT_STALE_MINUTES;
  if (limitMin === null) return false;
  return now.getTime() - updatedAt.getTime() > limitMin * 60_000;
}

export interface CrowdingInfo {
  /** Measured ratio (meaningless when stale). */
  ratio: number;
  /** What to show: the measured level, or 'unknown' when stale. */
  level: CrowdingLevel | 'unknown';
  stale: boolean;
  /** Ratio used for scoring: the measured one, or STALE_CROWD_RATIO when stale. */
  scoringRatio: number;
}

export function getCrowding(
  h: Pick<Hospital, 'erWaitingCount' | 'erComfortCapacity' | 'erCountUpdatedAt' | 'erCountSource'>,
  now: Date,
): CrowdingInfo {
  const ratio = crowdRatio(h.erWaitingCount, h.erComfortCapacity);
  const stale = isCountStale(h.erCountUpdatedAt?.toDate() ?? null, h.erCountSource, now);
  return {
    ratio,
    level: stale ? 'unknown' : crowdingLevel(ratio),
    stale,
    scoringRatio: stale ? STALE_CROWD_RATIO : ratio,
  };
}
