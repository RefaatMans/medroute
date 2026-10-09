import { orderBy, query } from 'firebase/firestore';
import { hospitalDoc, hospitalsCol } from '../services/db';
import { useLiveDoc, useLiveQuery } from './useLive';

export function useHospitals() {
  return useLiveQuery('hospitals', () => query(hospitalsCol(), orderBy('name')));
}

export function useHospital(hospitalId: string | null | undefined) {
  return useLiveDoc(hospitalId ? `hospital/${hospitalId}` : null, () => hospitalDoc(hospitalId!));
}
