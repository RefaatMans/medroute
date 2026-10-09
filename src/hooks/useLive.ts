import { useEffect, useState } from 'react';
import { onSnapshot, type DocumentReference, type Query } from 'firebase/firestore';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  /** True while showing cached data because the server is unreachable. */
  fromCache: boolean;
}

/**
 * Subscribes to a Firestore query with `onSnapshot`. `key` identifies the query: the listener is
 * re-created only when it changes, and `null` means "nothing to listen to yet".
 */
export function useLiveQuery<T>(key: string | null, makeQuery: () => Query<T>): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: key !== null, error: null, fromCache: false });

  useEffect(() => {
    if (key === null) {
      setState({ data: [], loading: false, error: null, fromCache: false });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    return onSnapshot(
      makeQuery(),
      { includeMetadataChanges: true },
      (snap) =>
        setState({ data: snap.docs.map((d) => d.data()), loading: false, error: null, fromCache: snap.metadata.fromCache }),
      (error) => setState((s) => ({ ...s, loading: false, error })),
    );
    // makeQuery is re-created every render; `key` captures everything it depends on.
  }, [key]);

  return state;
}

/** Same as `useLiveQuery` for a single document. `data` is null when it doesn't exist. */
export function useLiveDoc<T>(key: string | null, makeRef: () => DocumentReference<T>): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: key !== null, error: null, fromCache: false });

  useEffect(() => {
    if (key === null) {
      setState({ data: null, loading: false, error: null, fromCache: false });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    return onSnapshot(
      makeRef(),
      { includeMetadataChanges: true },
      (snap) => setState({ data: snap.data() ?? null, loading: false, error: null, fromCache: snap.metadata.fromCache }),
      (error) => setState((s) => ({ ...s, loading: false, error })),
    );
  }, [key]);

  return state;
}
