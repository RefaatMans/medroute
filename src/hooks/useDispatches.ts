import { useEffect, useMemo, useState } from 'react';
import { query, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { SWEEPER_INTERVAL_SEC } from '../config/dispatch';
import { dispatchDoc, dispatchesCol } from '../services/db';
import { releaseExpiredDispatches } from '../services/dispatchService';
import { useAmbulance } from './useAmbulances';
import { useInterval } from './useInterval';
import { useLiveDoc, useLiveQuery } from './useLive';

/** En-route dispatches heading to one hospital, newest first. */
export function useIncomingDispatches(hospitalId: string | null | undefined) {
  const live = useLiveQuery(hospitalId ? `incoming/${hospitalId}` : null, () =>
    query(dispatchesCol(), where('hospitalId', '==', hospitalId!), where('status', '==', 'en_route')),
  );
  // Sorted here rather than with orderBy, so no composite index is required.
  const data = useMemo(
    () => [...live.data].sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)),
    [live.data],
  );
  return { ...live, data };
}

/** All en-route dispatches (admin overview). */
export function useOpenDispatches() {
  return useLiveQuery('dispatches/open', () => query(dispatchesCol(), where('status', '==', 'en_route')));
}

/**
 * The ambulance doc plus the dispatch it is on. The dispatch stays tracked after it closes
 * (so the paramedic can see "declined" / "expired" and why) until `clear()` is called.
 */
export function useActiveDispatch(ambulanceId: string | null | undefined) {
  const ambulance = useAmbulance(ambulanceId);
  const activeId = ambulance.data?.activeDispatchId ?? null;
  const [trackedId, setTrackedId] = useState<string | null>(null);

  useEffect(() => {
    if (activeId) setTrackedId(activeId);
  }, [activeId]);

  const dispatch = useLiveDoc(trackedId ? `dispatch/${trackedId}` : null, () => dispatchDoc(trackedId!));
  return { ambulance, activeId, dispatch, clear: () => setTrackedId(null) };
}

/**
 * Client-side replacement for a server cron: expires overdue reservations every
 * SWEEPER_INTERVAL_SEC. `scope` limits it to one hospital; `undefined` sweeps everything.
 */
export function useDispatchSweeper(scope?: string | null) {
  const sweep = () =>
    releaseExpiredDispatches(scope)
      .then((n) => n > 0 && toast(`${n} expired reservation${n === 1 ? '' : 's'} released`, { icon: '⏱️' }))
      .catch((err) => console.warn('Dispatch sweeper failed', err));

  useEffect(() => {
    void sweep();
  }, [scope]);
  useInterval(sweep, SWEEPER_INTERVAL_SEC * 1000);
}
