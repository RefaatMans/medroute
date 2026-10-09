import { getDocs, query, where } from 'firebase/firestore';
import { STRESS_TEST_FREE_BEDS } from '../config/dispatch';
import { DEMO_LOCATIONS } from '../config/demoLocations';
import { pathTo } from '../lib/bedMachine';
import { compareLabels } from '../lib/time';
import type { BedType, CaseType, Severity } from '../types';
import { applyBedEvent } from './bedService';
import { ambulancesCol, bedsCol } from './db';
import { cancelDispatch, createDispatch, type CreateDispatchResult } from './dispatchService';
import { setDiverting } from './hospitalService';

/** A case that needs each bed type, so the test targets exactly that type. */
export const STRESS_CASE: Record<BedType, { caseType: CaseType; severity: Severity }> = {
  icu: { caseType: 'general', severity: 'critical' },
  general: { caseType: 'general', severity: 'stable' },
  pediatric: { caseType: 'pediatric', severity: 'stable' },
  maternity: { caseType: 'maternity', severity: 'stable' },
};

async function simulatedAmbulances() {
  const snap = await getDocs(query(ambulancesCol(), where('simulated', '==', true)));
  return snap.docs.map((d) => d.data()).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * "Prepare": frees the simulated ambulances, takes the hospital off diversion, and walks the
 * beds of `bedType` (via normal bed events, never by overwriting) so exactly `freeBeds` are
 * available and the rest occupied.
 */
export async function prepareStressTest(
  hospitalId: string,
  bedType: BedType,
  freeBeds = STRESS_TEST_FREE_BEDS,
  onProgress?: (done: number, total: number) => void,
): Promise<{ free: number; total: number }> {
  for (const a of await simulatedAmbulances()) {
    if (a.activeDispatchId) await cancelDispatch(a.activeDispatchId, 'Stress test reset');
  }
  await setDiverting(hospitalId, false);

  const load = async () =>
    (await getDocs(query(bedsCol(hospitalId), where('type', '==', bedType)))).docs
      .map((d) => d.data())
      .sort((a, b) => compareLabels(a.label, b.label));

  for (const b of await load()) {
    if (b.status === 'reserved' && b.reservedByDispatchId) await cancelDispatch(b.reservedByDispatchId, 'Stress test prepare');
  }

  const beds = await load();
  for (const [i, bed] of beds.entries()) {
    // A reservation whose trip is already closed (inconsistent data): release it directly.
    const status = bed.status === 'reserved' ? (await applyBedEvent(hospitalId, bed.id, 'RELEASE')).to : bed.status;
    for (const event of pathTo(status, i < freeBeds ? 'available' : 'occupied')) {
      await applyBedEvent(hospitalId, bed.id, event);
    }
    onProgress?.(i + 1, beds.length);
  }
  return { free: Math.min(freeBeds, beds.length), total: beds.length };
}

export interface StressResult {
  ambulanceId: string;
  callSign: string;
  result: CreateDispatchResult | { ok: false; code: 'ERROR'; message: string };
}

/** "Fire": N simulated ambulances request a bed at the same moment. */
export async function fireStressTest(hospitalId: string, bedType: BedType, n: number): Promise<StressResult[]> {
  const sims = (await simulatedAmbulances()).slice(0, n);
  const { caseType, severity } = STRESS_CASE[bedType];
  const fallback = DEMO_LOCATIONS[DEMO_LOCATIONS.length - 1].location;
  return Promise.all(
    sims.map(async (a) => ({
      ambulanceId: a.id,
      callSign: a.callSign,
      result: await createDispatch({
        ambulanceId: a.id,
        hospitalId,
        caseType,
        severity,
        origin: a.location ?? fallback,
        etaMinutes: 10,
      }).catch((err: unknown) => ({ ok: false as const, code: 'ERROR' as const, message: String(err) })),
    })),
  );
}

/** "Clean up": cancels the dispatches the test created. */
export async function cleanUpStressTest(dispatchIds: string[]): Promise<number> {
  let n = 0;
  for (const id of dispatchIds) if (await cancelDispatch(id, 'Stress test clean-up')) n++;
  return n;
}
