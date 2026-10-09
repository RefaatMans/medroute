import { describe, expect, it } from 'vitest';
import { DEMO_LOCATIONS } from '../src/config/demoLocations';
import { estimateTravelMinutes, haversineKm } from '../src/lib/geo';

const place = (name: string) => DEMO_LOCATIONS.find((l) => l.name === name)!.location;

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(place('Hamra'), place('Hamra'))).toBe(0);
  });

  it('one degree of latitude ≈ 111.2 km', () => {
    expect(haversineKm({ lat: 33, lng: 35 }, { lat: 34, lng: 35 })).toBeCloseTo(111.19, 1);
  });

  // The spec suggested 10–12 km here, but with its own coordinates the straight-line
  // distance is ~14.1 km (the road trip is ~16–20 km).
  it('Downtown Beirut → Jounieh ≈ 14 km straight-line', () => {
    const d = haversineKm(place('Downtown Beirut'), place('Jounieh'));
    expect(d).toBeGreaterThan(13.5);
    expect(d).toBeLessThan(14.5);
  });

  it('is symmetric', () => {
    const a = place('Achrafieh');
    const b = place('Baabda');
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });
});

describe('estimateTravelMinutes', () => {
  it('applies road factor 1.4 at 40 km/h', () => {
    // 10 km × 1.4 = 14 km road; 14 / 40 h = 21 min
    expect(estimateTravelMinutes(10)).toBeCloseTo(21, 10);
  });
  it('is zero for zero distance', () => {
    expect(estimateTravelMinutes(0)).toBe(0);
  });
});
