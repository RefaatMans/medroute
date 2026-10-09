import type { BedCounts, BedStatus, BedSummary, BedType } from '../types';

export function emptyCounts(): BedCounts {
  return { total: 0, available: 0, reserved: 0, occupied: 0, cleaning: 0, out_of_service: 0 };
}

/** Builds the cached `hospital.bedSummary` from scratch. */
export function summarizeBeds(beds: readonly { type: BedType; status: BedStatus }[]): BedSummary {
  const summary: BedSummary = {};
  for (const bed of beds) {
    const c = (summary[bed.type] ??= emptyCounts());
    c.total += 1;
    c[bed.status] += 1;
  }
  return summary;
}

/** Returns a copy of `summary` with one bed of `type` moved from status `from` to `to`. */
export function applyStatusChange(summary: BedSummary, type: BedType, from: BedStatus, to: BedStatus): BedSummary {
  const c = { ...(summary[type] ?? emptyCounts()) };
  c[from] = Math.max(0, c[from] - 1);
  c[to] += 1;
  return { ...summary, [type]: c };
}
