import { getDocs, query, serverTimestamp, where, writeBatch, type WriteBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { crowdingLevel, crowdRatio } from '../lib/crowding';
import { buildDemoHospitals, SEED_AMBULANCES } from '../lib/demoData';
import { ambulanceDoc, bedDoc, bedsCol, dispatchDoc, dispatchesCol, hospitalDoc, hospitalsCol } from './db';

/** Firestore allows 500 writes per batch; stay under it. */
const BATCH_LIMIT = 450;

async function commitInChunks(writes: ((b: WriteBatch) => void)[]): Promise<void> {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    writes.slice(i, i + BATCH_LIMIT).forEach((w) => w(batch));
    await batch.commit();
  }
}

export interface SeedResult {
  hospitals: number;
  beds: number;
  ambulances: number;
}

/**
 * Writes the demo hospitals, beds and ambulances (spec section 11). Uses fixed document IDs,
 * so running it again overwrites the demo rather than duplicating it.
 */
export async function seedDemoData(): Promise<SeedResult> {
  const hospitals = buildDemoHospitals();
  const writes: ((b: WriteBatch) => void)[] = [];

  // Remove hospitals from an older seed list (and their beds) so the map shows only current ones.
  const keep = new Set(hospitals.map((h) => h.seed.id));
  for (const old of (await getDocs(hospitalsCol())).docs.filter((d) => !keep.has(d.id))) {
    for (const bed of (await getDocs(bedsCol(old.id))).docs) writes.push((b) => b.delete(bed.ref));
    writes.push((b) => b.delete(old.ref));
  }

  for (const { seed, beds, bedSummary } of hospitals) {
    writes.push((b) =>
      b.set(hospitalDoc(seed.id), {
        id: seed.id,
        name: seed.name,
        address: seed.address,
        phone: seed.phone,
        location: seed.location,
        capabilities: seed.capabilities,
        diverting: false,
        erComfortCapacity: seed.erComfortCapacity,
        erWaitingCount: seed.erWaitingCount,
        erCrowdingLevel: crowdingLevel(crowdRatio(seed.erWaitingCount, seed.erComfortCapacity)),
        erCountUpdatedAt: serverTimestamp(),
        erCountSource: 'manual',
        bedSummary,
        incomingCount: 0,
        updatedAt: serverTimestamp(),
      }),
    );
    for (const bed of beds) {
      writes.push((b) =>
        b.set(bedDoc(seed.id, bed.id), {
          ...bed,
          lastSensorAt: null,
          reservedByDispatchId: null,
          updatedAt: serverTimestamp(),
        }),
      );
    }
  }

  for (const amb of SEED_AMBULANCES) {
    writes.push((b) =>
      b.set(ambulanceDoc(amb.id), {
        ...amb,
        locationUpdatedAt: amb.location ? serverTimestamp() : null,
        status: 'idle',
        activeDispatchId: null,
      }),
    );
  }

  await commitInChunks(writes);
  return {
    hospitals: hospitals.length,
    beds: hospitals.reduce((n, h) => n + h.beds.length, 0),
    ambulances: SEED_AMBULANCES.length,
  };
}

/**
 * Closes every open dispatch, then re-seeds (which resets beds, counters and ambulances).
 * Returns the number of dispatches that were cancelled.
 */
export async function resetDemo(): Promise<SeedResult & { cancelledDispatches: number }> {
  const open = await getDocs(query(dispatchesCol(), where('status', '==', 'en_route')));
  await commitInChunks(
    open.docs.map((d) => (b: WriteBatch) =>
      b.update(dispatchDoc(d.id), {
        status: 'cancelled',
        closedAt: serverTimestamp(),
        closedReason: 'Demo reset by admin',
      }),
    ),
  );
  const result = await seedDemoData();
  return { ...result, cancelledDispatches: open.size };
}
