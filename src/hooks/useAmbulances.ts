import { orderBy, query } from 'firebase/firestore';
import { ambulanceDoc, ambulancesCol } from '../services/db';
import { useLiveDoc, useLiveQuery } from './useLive';

export function useAmbulances() {
  return useLiveQuery('ambulances', () => query(ambulancesCol(), orderBy('callSign')));
}

export function useAmbulance(ambulanceId: string | null | undefined) {
  return useLiveDoc(ambulanceId ? `ambulance/${ambulanceId}` : null, () => ambulanceDoc(ambulanceId!));
}
