import { bedsCol } from '../services/db';
import { useLiveQuery } from './useLive';

/** All beds of one hospital, live. Sorted by the caller (labels need natural sort). */
export function useBeds(hospitalId: string | null | undefined) {
  return useLiveQuery(hospitalId ? `beds/${hospitalId}` : null, () => bedsCol(hospitalId!));
}
