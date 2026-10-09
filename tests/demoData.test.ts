import { describe, expect, it } from 'vitest';
import { applyStatusChange, summarizeBeds } from '../src/lib/bedSummary';
import { buildDemoHospitals, SEED_AMBULANCES, SEED_HOSPITALS } from '../src/lib/demoData';
import { BED_TYPES } from '../src/types';

describe('summarizeBeds / applyStatusChange', () => {
  it('counts beds per type and status', () => {
    const s = summarizeBeds([
      { type: 'icu', status: 'available' },
      { type: 'icu', status: 'occupied' },
      { type: 'general', status: 'cleaning' },
    ]);
    expect(s.icu).toEqual({ total: 2, available: 1, reserved: 0, occupied: 1, cleaning: 0, out_of_service: 0 });
    expect(s.general?.cleaning).toBe(1);
    expect(s.pediatric).toBeUndefined();
  });

  it('moves one bed between counters without mutating the input', () => {
    const before = summarizeBeds([{ type: 'icu', status: 'available' }]);
    const after = applyStatusChange(before, 'icu', 'available', 'reserved');
    expect(after.icu).toMatchObject({ total: 1, available: 0, reserved: 1 });
    expect(before.icu?.available).toBe(1);
  });
});

describe('demo data', () => {
  const hospitals = buildDemoHospitals();

  it('is deterministic', () => {
    expect(buildDemoHospitals()).toEqual(hospitals);
  });

  it('creates the bed counts from the spec, with unique IDs and labels', () => {
    for (const { seed, beds } of hospitals) {
      for (const type of BED_TYPES) {
        expect(beds.filter((b) => b.type === type)).toHaveLength(seed.beds[type]);
      }
      expect(new Set(beds.map((b) => b.id)).size).toBe(beds.length);
    }
    const cedar = hospitals.find((h) => h.seed.id === 'h-cedar')!;
    expect(cedar.beds.map((b) => b.label)).toContain('ICU-6');
    expect(cedar.beds.map((b) => b.label)).toContain('GEN-20');
  });

  it('is roughly 70% occupied, 10% cleaning, with at least one free bed of each type', () => {
    const all = hospitals.flatMap((h) => h.beds);
    const share = (s: string) => all.filter((b) => b.status === s).length / all.length;
    expect(share('occupied')).toBeGreaterThan(0.6);
    expect(share('occupied')).toBeLessThan(0.75);
    expect(share('cleaning')).toBeGreaterThan(0.05);
    for (const { bedSummary } of hospitals) {
      for (const c of Object.values(bedSummary)) expect(c!.available).toBeGreaterThanOrEqual(1);
    }
  });

  it('marks occupied beds as sensor-occupied and summary matches beds', () => {
    for (const { beds, bedSummary } of hospitals) {
      for (const b of beds) expect(b.sensorOccupied).toBe(b.status === 'occupied');
      expect(bedSummary).toEqual(summarizeBeds(beds));
    }
  });

  it('every hospital has the general capability', () => {
    for (const h of SEED_HOSPITALS) expect(h.capabilities).toContain('general');
  });

  it('has 3 real and 10 simulated ambulances', () => {
    expect(SEED_AMBULANCES.filter((a) => !a.simulated).map((a) => a.id)).toEqual(['amb-01', 'amb-02', 'amb-03']);
    expect(SEED_AMBULANCES.filter((a) => a.simulated)).toHaveLength(10);
  });
});
