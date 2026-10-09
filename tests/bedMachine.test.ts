import { describe, expect, it } from 'vitest';
import { completesTrip, nextBedStatus, pathTo, staffActionsFor } from '../src/lib/bedMachine';
import { BED_EVENTS, BED_STATUSES, type BedEvent, type BedStatus } from '../src/types';

const VALID: [BedStatus, BedEvent, BedStatus][] = [
  ['available', 'SENSOR_OCCUPIED', 'occupied'],
  ['reserved', 'SENSOR_OCCUPIED', 'occupied'],
  ['cleaning', 'SENSOR_OCCUPIED', 'occupied'],
  ['occupied', 'SENSOR_EMPTY', 'cleaning'],
  ['cleaning', 'STAFF_MARK_CLEANED', 'available'],
  ['reserved', 'STAFF_PATIENT_ADMITTED', 'occupied'],
  ['available', 'STAFF_PATIENT_ADMITTED', 'occupied'],
  ['available', 'STAFF_OUT_OF_SERVICE', 'out_of_service'],
  ['occupied', 'STAFF_OUT_OF_SERVICE', 'out_of_service'],
  ['cleaning', 'STAFF_OUT_OF_SERVICE', 'out_of_service'],
  ['out_of_service', 'STAFF_BACK_IN_SERVICE', 'cleaning'],
  ['available', 'RESERVE', 'reserved'],
  ['reserved', 'RELEASE', 'available'],
  ['reserved', 'AMBULANCE_ARRIVED', 'occupied'],
];

describe('nextBedStatus: valid transitions', () => {
  it.each(VALID)('%s --%s--> %s', (from, event, to) => {
    expect(nextBedStatus(from, event)).toEqual({ ok: true, changed: true, from, to });
  });
});

describe('nextBedStatus: sensor no-ops', () => {
  it.each<[BedStatus, BedEvent]>([
    ['occupied', 'SENSOR_OCCUPIED'],
    ['out_of_service', 'SENSOR_OCCUPIED'],
    ['available', 'SENSOR_EMPTY'],
    ['reserved', 'SENSOR_EMPTY'],
    ['cleaning', 'SENSOR_EMPTY'],
    ['out_of_service', 'SENSOR_EMPTY'],
  ])('%s + %s is a no-op, not an error', (from, event) => {
    expect(nextBedStatus(from, event)).toEqual({ ok: true, changed: false, from, to: from });
  });
});

describe('nextBedStatus: invalid transitions', () => {
  it.each<[BedStatus, BedEvent]>([
    ['reserved', 'RESERVE'], // the double-booking guard
    ['occupied', 'RESERVE'],
    ['cleaning', 'RESERVE'],
    ['available', 'RELEASE'],
    ['occupied', 'STAFF_MARK_CLEANED'], // can't skip cleaning
    ['available', 'STAFF_MARK_CLEANED'],
    ['reserved', 'STAFF_OUT_OF_SERVICE'], // would strand an ambulance
    ['out_of_service', 'STAFF_OUT_OF_SERVICE'],
    ['available', 'STAFF_BACK_IN_SERVICE'],
    ['available', 'AMBULANCE_ARRIVED'],
    ['occupied', 'STAFF_PATIENT_ADMITTED'],
    ['out_of_service', 'RESERVE'],
  ])('%s + %s → INVALID_TRANSITION', (from, event) => {
    expect(nextBedStatus(from, event)).toEqual({ ok: false, error: 'INVALID_TRANSITION', from, event });
  });

  it('only RESERVE can ever produce a reserved bed', () => {
    for (const from of BED_STATUSES) {
      for (const event of BED_EVENTS) {
        const r = nextBedStatus(from, event);
        if (r.ok && r.changed && r.to === 'reserved') expect(event).toBe('RESERVE');
      }
    }
  });

  it('a bed only becomes available via cleaning or release (never straight from occupied)', () => {
    for (const event of BED_EVENTS) {
      const r = nextBedStatus('occupied', event);
      if (r.ok) expect(r.to).not.toBe('available');
    }
  });
});

describe('completesTrip', () => {
  it('is true for arrival-type events on a reserved bed', () => {
    expect(completesTrip('reserved', 'SENSOR_OCCUPIED')).toBe(true);
    expect(completesTrip('reserved', 'STAFF_PATIENT_ADMITTED')).toBe(true);
    expect(completesTrip('reserved', 'AMBULANCE_ARRIVED')).toBe(true);
  });
  it('is false for release, or when the bed was not reserved', () => {
    expect(completesTrip('reserved', 'RELEASE')).toBe(false);
    expect(completesTrip('available', 'SENSOR_OCCUPIED')).toBe(false);
    expect(completesTrip('available', 'STAFF_PATIENT_ADMITTED')).toBe(false);
  });
});

describe('pathTo', () => {
  const walk = (from: BedStatus, events: BedEvent[]) =>
    events.reduce<BedStatus>((s, e) => {
      const r = nextBedStatus(s, e);
      if (!r.ok || !r.changed) throw new Error(`${e} invalid or no-op from ${s}`);
      return r.to;
    }, from);

  it.each(BED_STATUSES.filter((s) => s !== 'reserved'))('from %s reaches available and occupied via valid events', (from) => {
    expect(walk(from, pathTo(from, 'available'))).toBe('available');
    expect(walk(from, pathTo(from, 'occupied'))).toBe('occupied');
  });

  it('refuses to touch a reserved bed', () => {
    expect(() => pathTo('reserved', 'available')).toThrow();
  });
});

describe('staffActionsFor', () => {
  it('lists only the actions valid for each status', () => {
    expect(staffActionsFor('available')).toEqual(['STAFF_PATIENT_ADMITTED', 'STAFF_OUT_OF_SERVICE']);
    expect(staffActionsFor('reserved')).toEqual(['STAFF_PATIENT_ADMITTED']);
    expect(staffActionsFor('occupied')).toEqual(['STAFF_OUT_OF_SERVICE']);
    expect(staffActionsFor('cleaning')).toEqual(['STAFF_MARK_CLEANED', 'STAFF_OUT_OF_SERVICE']);
    expect(staffActionsFor('out_of_service')).toEqual(['STAFF_BACK_IN_SERVICE']);
  });
});
