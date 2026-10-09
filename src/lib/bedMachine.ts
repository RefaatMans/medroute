import type { BedEvent, BedStatus } from '../types';

/**
 * Bed status lifecycle (spec 4.5). Pure: decides the next status, never writes anything.
 *
 * Sensor events never fail: a sensor reports what it measures, so a reading that
 * doesn't move the bed anywhere (e.g. "empty" on an available bed) is a no-op.
 * Staff / system events that aren't allowed from the current status are errors.
 */

interface Transition {
  from: readonly BedStatus[];
  to: BedStatus;
}

export const TRANSITIONS: Record<BedEvent, Transition> = {
  SENSOR_OCCUPIED: { from: ['available', 'reserved', 'cleaning'], to: 'occupied' },
  SENSOR_EMPTY: { from: ['occupied'], to: 'cleaning' },
  STAFF_MARK_CLEANED: { from: ['cleaning'], to: 'available' },
  STAFF_PATIENT_ADMITTED: { from: ['reserved', 'available'], to: 'occupied' },
  STAFF_OUT_OF_SERVICE: { from: ['available', 'occupied', 'cleaning'], to: 'out_of_service' },
  STAFF_BACK_IN_SERVICE: { from: ['out_of_service'], to: 'cleaning' },
  RESERVE: { from: ['available'], to: 'reserved' },
  RELEASE: { from: ['reserved'], to: 'available' },
  AMBULANCE_ARRIVED: { from: ['reserved'], to: 'occupied' },
};

const SENSOR_EVENTS: readonly BedEvent[] = ['SENSOR_OCCUPIED', 'SENSOR_EMPTY'];

/** Events that, applied to a `reserved` bed, mean the ambulance's patient is now in it. */
const TRIP_COMPLETING_EVENTS: readonly BedEvent[] = ['SENSOR_OCCUPIED', 'STAFF_PATIENT_ADMITTED', 'AMBULANCE_ARRIVED'];

/** Actions hospital staff can take from the bed board, in display order. */
export const STAFF_EVENTS = [
  'STAFF_MARK_CLEANED',
  'STAFF_PATIENT_ADMITTED',
  'STAFF_OUT_OF_SERVICE',
  'STAFF_BACK_IN_SERVICE',
] as const satisfies readonly BedEvent[];
export type StaffEvent = (typeof STAFF_EVENTS)[number];

export type TransitionResult =
  | { ok: true; changed: true; from: BedStatus; to: BedStatus }
  | { ok: true; changed: false; from: BedStatus; to: BedStatus }
  | { ok: false; error: 'INVALID_TRANSITION'; from: BedStatus; event: BedEvent };

export function nextBedStatus(current: BedStatus, event: BedEvent): TransitionResult {
  const t = TRANSITIONS[event];
  if (t.from.includes(current)) {
    return { ok: true, changed: true, from: current, to: t.to };
  }
  if (SENSOR_EVENTS.includes(event)) {
    return { ok: true, changed: false, from: current, to: current };
  }
  return { ok: false, error: 'INVALID_TRANSITION', from: current, event };
}

/** True when this event on a bed in `from` status closes the linked dispatch as `arrived`. */
export function completesTrip(from: BedStatus, event: BedEvent): boolean {
  return from === 'reserved' && TRIP_COMPLETING_EVENTS.includes(event);
}

/**
 * The events that walk a bed from `from` to `target` using only valid transitions (used by the
 * stress-test "Prepare" tool). Reserved beds must be released by closing their dispatch first.
 */
export function pathTo(from: BedStatus, target: 'available' | 'occupied'): BedEvent[] {
  const PATHS: Record<Exclude<BedStatus, 'reserved'>, Record<'available' | 'occupied', BedEvent[]>> = {
    available: { available: [], occupied: ['SENSOR_OCCUPIED'] },
    occupied: { available: ['SENSOR_EMPTY', 'STAFF_MARK_CLEANED'], occupied: [] },
    cleaning: { available: ['STAFF_MARK_CLEANED'], occupied: ['SENSOR_OCCUPIED'] },
    out_of_service: {
      available: ['STAFF_BACK_IN_SERVICE', 'STAFF_MARK_CLEANED'],
      occupied: ['STAFF_BACK_IN_SERVICE', 'SENSOR_OCCUPIED'],
    },
  };
  if (from === 'reserved') throw new Error('Release the reservation before changing a reserved bed.');
  return PATHS[from][target];
}

/** Staff actions valid for a bed in this status. Invalid actions are hidden in the UI. */
export function staffActionsFor(status: BedStatus): StaffEvent[] {
  return STAFF_EVENTS.filter((e) => TRANSITIONS[e].from.includes(status));
}
