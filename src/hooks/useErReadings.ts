import { limit as limitTo, orderBy, query } from 'firebase/firestore';
import { ER_READINGS_LIMIT } from '../config/camera';
import { erReadingsCol } from '../services/db';
import { useLiveQuery } from './useLive';

/** The newest `limit` ER readings, live, newest first. */
export function useErReadings(hospitalId: string | null | undefined, limit = ER_READINGS_LIMIT) {
  return useLiveQuery(hospitalId ? `erReadings/${hospitalId}/${limit}` : null, () =>
    query(erReadingsCol(hospitalId!), orderBy('at', 'desc'), limitTo(limit)),
  );
}
