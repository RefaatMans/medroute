import { serverTimestamp, updateDoc } from 'firebase/firestore';
import type { LatLng } from '../types';
import { ambulanceDoc } from './db';

export async function updateAmbulanceLocation(ambulanceId: string, location: LatLng): Promise<void> {
  await updateDoc(ambulanceDoc(ambulanceId), {
    location: { lat: location.lat, lng: location.lng },
    locationUpdatedAt: serverTimestamp(),
  });
}
