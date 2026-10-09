import { describe, expect, it } from 'vitest';
import { getRequirements } from '../src/config/caseRules';
import { CROWD_WEIGHT_MIN, LAST_BED_PENALTY_MIN } from '../src/config/routing';
import { estimateTravelMinutes, haversineKm } from '../src/lib/geo';
import { recommendHospitals } from '../src/lib/scoring';
import { counts, makeHospital, minutesAgo, NOW } from './helpers';

const ORIGIN = { lat: 33.89, lng: 35.5 };
/** A point `km` kilometres due east of ORIGIN (1° lng ≈ 92.4 km at this latitude). */
const east = (km: number) => ({ lat: ORIGIN.lat, lng: ORIGIN.lng + km / 92.43 });

const run = (hospitals: ReturnType<typeof makeHospital>[], caseType = 'cardiac' as const, severity = 'urgent' as const) =>
  recommendHospitals({ origin: ORIGIN, caseType, severity, hospitals, now: NOW });

describe('getRequirements', () => {
  it('maps critical adult cases to ICU and others to general', () => {
    expect(getRequirements('cardiac', 'critical')).toEqual({ capability: 'cardiac', bedType: 'icu' });
    expect(getRequirements('cardiac', 'stable')).toEqual({ capability: 'cardiac', bedType: 'general' });
    expect(getRequirements('respiratory', 'critical')).toEqual({ capability: 'general', bedType: 'icu' });
  });
  it('keeps pediatric and maternity on their own bed types even when critical', () => {
    expect(getRequirements('pediatric', 'critical')).toEqual({ capability: 'pediatric', bedType: 'pediatric' });
    expect(getRequirements('maternity', 'urgent')).toEqual({ capability: 'maternity', bedType: 'maternity' });
  });
});

describe('recommendHospitals: exclusions', () => {
  it('excludes diverting hospitals', () => {
    const r = run([makeHospital({ id: 'a', diverting: true })]);
    expect(r.ranked).toHaveLength(0);
    expect(r.excluded).toEqual([{ hospital: expect.objectContaining({ id: 'a' }), reason: 'Hospital is on diversion' }]);
  });

  it('excludes hospitals without the capability', () => {
    const r = run([makeHospital({ id: 'a', capabilities: ['general', 'trauma'] })], 'cardiac');
    expect(r.excluded[0].reason).toBe('Cannot treat cardiac');
  });

  it('excludes hospitals with no free beds of the required type', () => {
    const h = makeHospital({ id: 'a', bedSummary: { general: counts(5), icu: counts(0) } });
    expect(run([h], 'cardiac', 'urgent').ranked).toHaveLength(1); // needs general → fine
    expect(recommendHospitals({ origin: ORIGIN, caseType: 'cardiac', severity: 'critical', hospitals: [h], now: NOW })
      .excluded[0].reason).toBe('No ICU beds free');
  });

  it('treats a missing bed type as zero beds', () => {
    const h = makeHospital({ id: 'a', bedSummary: { general: counts(5) } });
    const r = recommendHospitals({ origin: ORIGIN, caseType: 'pediatric', severity: 'stable', hospitals: [h], now: NOW });
    expect(r.excluded[0].reason).toBe('No pediatric beds free');
  });
});

describe('recommendHospitals: ranking', () => {
  it('ranks closer hospitals first when everything else is equal', () => {
    const r = run([makeHospital({ id: 'far', location: east(8) }), makeHospital({ id: 'near', location: east(2) })]);
    expect(r.ranked.map((x) => x.hospital.id)).toEqual(['near', 'far']);
  });

  it('ranks a crowded hospital below a slightly farther uncrowded one', () => {
    const crowded = makeHospital({ id: 'crowded', location: east(2), erWaitingCount: 30 }); // ratio 1.5 → +22.5 min
    const calm = makeHospital({ id: 'calm', location: east(4), erWaitingCount: 2 }); // ratio 0.1 → +1.5 min
    const r = run([crowded, calm]);
    expect(r.ranked.map((x) => x.hospital.id)).toEqual(['calm', 'crowded']);
    const crowdedRec = r.ranked[1];
    expect(crowdedRec.crowdingLevel).toBe('high');
    expect(crowdedRec.reasons).toContain('ER crowding: HIGH (30 people waiting) — +23 min penalty');
  });

  it('computes score = travel + crowd penalty (+ last-bed penalty)', () => {
    const h = makeHospital({ id: 'a', location: east(5), erWaitingCount: 10 });
    const [rec] = run([h]).ranked;
    const travel = estimateTravelMinutes(haversineKm(ORIGIN, h.location));
    expect(rec.travelMinutes).toBeCloseTo(travel, 10);
    expect(rec.crowdPenalty).toBeCloseTo(0.5 * CROWD_WEIGHT_MIN, 10);
    expect(rec.score).toBeCloseTo(travel + 7.5, 10);
  });

  it('caps the crowd penalty at 30 minutes', () => {
    const [rec] = run([makeHospital({ id: 'a', erWaitingCount: 200 })]).ranked;
    expect(rec.crowdPenalty).toBe(30);
  });

  it('halves the crowd penalty for critical patients', () => {
    const h = makeHospital({ id: 'a', erWaitingCount: 20 }); // ratio 1.0 → 15 min
    const urgent = run([h], 'cardiac', 'urgent').ranked[0];
    const critical = recommendHospitals({ origin: ORIGIN, caseType: 'cardiac', severity: 'critical', hospitals: [h], now: NOW })
      .ranked[0];
    expect(urgent.crowdPenalty).toBeCloseTo(15, 10);
    expect(critical.crowdPenalty).toBeCloseTo(7.5, 10);
  });

  it('handles a stale camera: crowding unknown, scored as ratio 0.8', () => {
    const h = makeHospital({ id: 'a', erWaitingCount: 0, erCountUpdatedAt: minutesAgo(45) });
    const [rec] = run([h]).ranked;
    expect(rec.crowdingLevel).toBe('unknown');
    expect(rec.crowdPenalty).toBeCloseTo(0.8 * CROWD_WEIGHT_MIN, 10);
    expect(rec.reasons).toContain('Camera offline — crowding unknown');
  });

  it('adds a penalty for taking the very last bed', () => {
    const plenty = makeHospital({ id: 'plenty' });
    const last = makeHospital({ id: 'last', bedSummary: { general: counts(1) } });
    const r = run([plenty, last]);
    const lastRec = r.ranked.find((x) => x.hospital.id === 'last')!;
    const plentyRec = r.ranked.find((x) => x.hospital.id === 'plenty')!;
    expect(lastRec.score - plentyRec.score).toBeCloseTo(LAST_BED_PENALTY_MIN, 10);
    expect(lastRec.reasons).toContain('Only 1 general bed free — +3 min penalty');
    expect(r.ranked.map((x) => x.hospital.id)).toEqual(['plenty', 'last']);
  });

  it('is a stable sort: equal scores keep input order', () => {
    const ids = ['h1', 'h2', 'h3', 'h4'];
    const r = run(ids.map((id) => makeHospital({ id })));
    expect(r.ranked.map((x) => x.hospital.id)).toEqual(ids);
  });

  it('uses pre-computed travel times when given (OSRM)', () => {
    const near = makeHospital({ id: 'near', location: east(1) });
    const far = makeHospital({ id: 'far', location: east(6) });
    const r = recommendHospitals({
      origin: ORIGIN,
      caseType: 'cardiac',
      severity: 'urgent',
      hospitals: [near, far],
      now: NOW,
      travelMinutesOverride: { near: 25, far: 9 }, // e.g. a river or a closed road in the way
    });
    expect(r.ranked.map((x) => x.hospital.id)).toEqual(['far', 'near']);
    expect(r.ranked[0].travelMinutes).toBe(9);
  });
});

describe('recommendHospitals: reasons', () => {
  it('describes ETA, free beds, crowding and marks the closest capable hospital', () => {
    const r = run([makeHospital({ id: 'a', location: east(4), erWaitingCount: 4 }), makeHospital({ id: 'b', location: east(9) })]);
    expect(r.ranked[0].reasons).toEqual([
      '≈ 8 min away',
      '5 general beds free',
      'ER crowding: LOW (4 people waiting) — +3 min penalty',
      'Closest hospital with a cardiac unit',
    ]);
    expect(r.ranked[1].reasons).not.toContain('Closest hospital with a cardiac unit');
  });

  it('labels ICU beds in upper case', () => {
    const r = recommendHospitals({
      origin: ORIGIN,
      caseType: 'stroke',
      severity: 'critical',
      hospitals: [makeHospital({ id: 'a', bedSummary: { icu: counts(3) } })],
      now: NOW,
    });
    expect(r.ranked[0].reasons).toContain('3 ICU beds free');
  });
});
