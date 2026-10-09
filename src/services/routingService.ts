import { OSRM_BASE_URL, OSRM_TIMEOUT_MS, USE_OSRM } from '../config/routing';
import type { Hospital, LatLng } from '../types';

/**
 * Optional real driving times from the public OSRM demo server (spec 6, step 3).
 * Returns minutes by hospital ID; hospitals that fail or time out are simply left out,
 * so `recommendHospitals` falls back to the distance formula for them.
 */
export async function fetchDrivingMinutes(origin: LatLng, hospitals: Hospital[]): Promise<Record<string, number>> {
  if (!USE_OSRM) return {};
  const results = await Promise.all(
    hospitals.map(async (h) => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
      try {
        const url = `${OSRM_BASE_URL}/${origin.lng},${origin.lat};${h.location.lng},${h.location.lat}?overview=false`;
        const res = await fetch(url, { signal: controller.signal });
        const json = (await res.json()) as { routes?: { duration: number }[] };
        const seconds = json.routes?.[0]?.duration;
        return typeof seconds === 'number' ? ([h.id, seconds / 60] as const) : null;
      } catch {
        return null;
      } finally {
        window.clearTimeout(timer);
      }
    }),
  );
  return Object.fromEntries(results.filter((r): r is readonly [string, number] => r !== null));
}
