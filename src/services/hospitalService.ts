import { addDoc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { crowdingLevel, crowdRatio } from '../lib/crowding';
import type { CrowdingLevel, ErCountSource } from '../types';
import { UserFacingError } from './authService';
import { erReadingsCol, hospitalDoc } from './db';

export async function setDiverting(hospitalId: string, diverting: boolean): Promise<void> {
  await updateDoc(hospitalDoc(hospitalId), { diverting, updatedAt: serverTimestamp() });
}

/** Writes a new ER waiting-room count and its crowding level. Returns the level. */
export async function updateErCount(hospitalId: string, count: number, source: ErCountSource): Promise<CrowdingLevel> {
  const n = Math.max(0, Math.round(count));
  const hospital = (await getDoc(hospitalDoc(hospitalId))).data();
  if (!hospital) throw new UserFacingError('Hospital not found.');
  const level = crowdingLevel(crowdRatio(n, hospital.erComfortCapacity));
  await updateDoc(hospitalDoc(hospitalId), {
    erWaitingCount: n,
    erCrowdingLevel: level,
    erCountUpdatedAt: serverTimestamp(),
    erCountSource: source,
  });
  return level;
}

/** Adds one point to the ER history chart. Callers throttle this to about once a minute. */
export async function appendErReading(hospitalId: string, count: number, level: CrowdingLevel): Promise<void> {
  await addDoc(erReadingsCol(hospitalId), { id: '', count, level, at: serverTimestamp() });
}
