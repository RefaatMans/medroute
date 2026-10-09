import type { BedCounts, BedSummary, Hospital, TimestampLike } from '../src/types';

export const NOW = new Date('2026-10-09T12:00:00Z');

export function ts(date: Date): TimestampLike {
  return { toDate: () => date, toMillis: () => date.getTime() };
}

export function minutesAgo(min: number, now = NOW): TimestampLike {
  return ts(new Date(now.getTime() - min * 60_000));
}

export function counts(available: number, total = 10): BedCounts {
  return { total, available, reserved: 0, occupied: total - available, cleaning: 0, out_of_service: 0 };
}

/** A hospital that accepts everything, with plenty of beds and an empty, fresh ER. Override as needed. */
export function makeHospital(overrides: Partial<Hospital> & { id: string }): Hospital {
  const bedSummary: BedSummary = {
    general: counts(5),
    icu: counts(5),
    pediatric: counts(5),
    maternity: counts(5),
  };
  return {
    name: overrides.id,
    address: '',
    phone: '',
    location: { lat: 33.89, lng: 35.5 },
    capabilities: ['general', 'cardiac', 'stroke', 'trauma', 'burns', 'pediatric', 'maternity'],
    diverting: false,
    erComfortCapacity: 20,
    erWaitingCount: 0,
    erCrowdingLevel: 'low',
    erCountUpdatedAt: minutesAgo(1),
    erCountSource: 'camera',
    bedSummary,
    incomingCount: 0,
    updatedAt: minutesAgo(1),
    ...overrides,
  };
}
