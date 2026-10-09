import { HEARTBEAT_MS, READING_INTERVAL_MS, SMOOTHING_WINDOW, UPLOAD_MIN_INTERVAL_MS } from '../config/camera';
import { median } from './median';

/** Appends a raw count and keeps only the newest `size` values. */
export function pushWindow(buffer: readonly number[], value: number, size = SMOOTHING_WINDOW): number[] {
  return [...buffer, value].slice(-size);
}

/** Smoothed people count: median of the window, rounded to a whole person. */
export function smoothedCount(buffer: readonly number[]): number {
  return Math.round(median(buffer));
}

export interface UploadState {
  lastValue: number | null;
  lastAt: number | null;
}

/**
 * Decides whether to send the smoothed count now (spec 9.5): when it changed, but at most every
 * UPLOAD_MIN_INTERVAL_MS, plus a heartbeat every HEARTBEAT_MS so the hospital isn't marked stale.
 */
export function uploadDecision(value: number, nowMs: number, s: UploadState): 'change' | 'heartbeat' | null {
  if (s.lastAt === null) return 'change';
  const since = nowMs - s.lastAt;
  if (value !== s.lastValue && since >= UPLOAD_MIN_INTERVAL_MS) return 'change';
  if (since >= HEARTBEAT_MS) return 'heartbeat';
  return null;
}

/** A history point for the chart is due once a minute (and right away on the first upload). */
export function readingDue(nowMs: number, lastReadingAt: number | null): boolean {
  return lastReadingAt === null || nowMs - lastReadingAt >= READING_INTERVAL_MS;
}
