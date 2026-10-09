import { AVG_SPEED_KMH, ROAD_FACTOR } from '../config/routing';
import type { LatLng } from '../types';

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimated driving time for a straight-line distance (road factor + average siren speed). */
export function estimateTravelMinutes(distanceKm: number): number {
  return ((distanceKm * ROAD_FACTOR) / AVG_SPEED_KMH) * 60;
}
