import { useEffect, useState } from 'react';
import type { LatLng } from '../types';

export interface GeoState {
  position: LatLng | null;
  accuracyM: number | null;
  error: string | null;
  supported: boolean;
}

/** Live GPS position via `watchPosition`. Pass `enabled = false` to stop watching. */
export function useGeolocation(enabled = true): GeoState {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [state, setState] = useState<GeoState>({ position: null, accuracyM: null, error: null, supported });

  useEffect(() => {
    if (!enabled || !supported) return;
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracyM: pos.coords.accuracy,
          error: null,
          supported,
        }),
      (err) =>
        setState((s) => ({
          ...s,
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied.'
              : err.code === err.TIMEOUT
                ? 'GPS timed out.'
                : 'GPS position unavailable.',
        })),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, supported]);

  return state;
}
