import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import CaseTypePicker from '../components/CaseTypePicker';
import HospitalMap from '../components/map/HospitalMap';
import SeverityPicker from '../components/SeverityPicker';
import Spinner from '../components/Spinner';
import TripView from '../components/TripView';
import { DEMO_LOCATIONS } from '../config/demoLocations';
import { LOCATION_UPLOAD_INTERVAL_SEC } from '../config/dispatch';
import { MAP_COLORS } from '../config/ui';
import { useAuth } from '../hooks/useAuth';
import { useActiveDispatch } from '../hooks/useDispatches';
import { useGeolocation } from '../hooks/useGeolocation';
import { useHospitals } from '../hooks/useHospitals';
import { useInterval, useNow } from '../hooks/useInterval';
import { useOnline } from '../hooks/useOnline';
import { recommendHospitals, type RecommendResult } from '../lib/scoring';
import { updateAmbulanceLocation } from '../services/ambulanceService';
import { errorMessage } from '../services/authService';
import { cancelDispatch, createDispatch, FORCE_CANCEL_REASON } from '../services/dispatchService';
import { fetchDrivingMinutes } from '../services/routingService';
import type { CaseType, LatLng, Recommendation, Severity } from '../types';

interface ManualLocation {
  location: LatLng;
  label: string;
}

/**
 * Paramedic app: START → case type → severity → GO. The app picks the best hospital
 * (travel time + free beds + ability to treat + ER crowding), reserves a bed and shows the trip.
 */
export default function AmbulancePage() {
  const { profile } = useAuth();
  const ambulanceId = profile?.ambulanceId ?? null;
  const { ambulance, activeId, dispatch, clear } = useActiveDispatch(ambulanceId);
  const hospitals = useHospitals();
  const online = useOnline() && !hospitals.fromCache;
  const now = useNow();
  const geo = useGeolocation();

  const [started, setStarted] = useState(false);
  const [caseType, setCaseType] = useState<CaseType | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [manual, setManual] = useState<ManualLocation | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [going, setGoing] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [noHospital, setNoHospital] = useState<RecommendResult | null>(null);
  const [tripReasons, setTripReasons] = useState<{ dispatchId: string; reasons: string[] } | null>(null);
  const [drivingMinutes, setDrivingMinutes] = useState<Record<string, number>>({});

  const location = manual?.location ?? geo.position;
  const locationLabel = manual
    ? manual.label
    : geo.position
      ? `Live GPS${geo.accuracyM ? ` (±${Math.round(geo.accuracyM)} m)` : ''}`
      : null;
  const ready = Boolean(caseType && severity && location);

  const resetForm = () => {
    setStarted(false);
    setCaseType(null);
    setSeverity(null);
    setNoHospital(null);
  };

  // Share our position with dispatch/admin every 30 s.
  const lastSent = useRef<string | null>(null);
  useInterval(
    () => {
      if (!ambulanceId || !location) return;
      const key = `${location.lat.toFixed(5)},${location.lng.toFixed(5)}`;
      if (key === lastSent.current) return;
      lastSent.current = key;
      updateAmbulanceLocation(ambulanceId, location).catch(() => {
        lastSent.current = null; // retry next tick
      });
    },
    LOCATION_UPLOAD_INTERVAL_SEC * 1000,
  );

  // Optional real driving times (USE_OSRM in config/routing.ts). Re-fetched when we move ~100 m.
  const originKey = location ? `${location.lat.toFixed(3)},${location.lng.toFixed(3)}` : null;
  const hospitalKey = hospitals.data.map((h) => h.id).join(',');
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    fetchDrivingMinutes(location, hospitals.data).then((m) => !cancelled && setDrivingMinutes(m));
    return () => {
      cancelled = true;
    };
  }, [originKey, hospitalKey]);

  // React to the tracked trip closing (by a sensor, the hospital, the expiry sweeper, an admin or us).
  const d = dispatch.data;
  useEffect(() => {
    if (!d || d.status === 'en_route') return;
    const reopenWith = (message: string) => {
      setStarted(true);
      setCaseType(d.caseType);
      setSeverity(d.severity);
      setAlert(message);
    };
    if (d.status === 'arrived') {
      toast.success(`Arrived at ${d.hospitalName}. Trip closed.`);
      resetForm();
    } else if (d.status === 'expired' || d.status === 'declined') {
      reopenWith(d.closedReason ?? 'The reservation ended.');
    } else if (d.closedReason?.includes(FORCE_CANCEL_REASON)) {
      reopenWith('The trip was cancelled by the dispatch admin.');
    } else {
      resetForm(); // cancelled by us
    }
    clear();
  }, [d?.id, d?.status]);

  /** Tries hospitals best-first until one bed is reserved. */
  const reserveBest = async (ranked: Recommendation[]): Promise<boolean> => {
    for (const [i, rec] of ranked.entries()) {
      const r = await createDispatch({
        ambulanceId: ambulanceId!,
        hospitalId: rec.hospital.id,
        caseType: caseType!,
        severity: severity!,
        origin: location!,
        etaMinutes: rec.travelMinutes,
      });
      if (r.ok) {
        setTripReasons({ dispatchId: r.dispatchId, reasons: rec.reasons });
        toast.success(`${r.bedLabel} reserved at ${rec.hospital.name}${i > 0 ? ' (next best — the first choice just filled up)' : ''}`);
        return true;
      }
      if (r.code === 'AMBULANCE_BUSY') {
        toast.error('This ambulance already has an active trip.');
        return true;
      }
      // NO_BED or DIVERTING: someone took the last bed a moment ago. Try the next best.
    }
    return false;
  };

  const onGo = async () => {
    if (!ambulanceId || !caseType || !severity || !location) return;
    const result = recommendHospitals({
      origin: location,
      caseType,
      severity,
      hospitals: hospitals.data,
      now: new Date(),
      travelMinutesOverride: drivingMinutes,
    });
    setAlert(null);
    setNoHospital(null);
    setGoing(true);
    try {
      void updateAmbulanceLocation(ambulanceId, location).catch(() => undefined);
      if (!(await reserveBest(result.ranked))) {
        setNoHospital(result);
        toast.error('No suitable hospital has a free bed right now.');
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setGoing(false);
    }
  };

  // Other options, for the "choose a different hospital" link on the trip screen.
  const inTrip = Boolean(activeId && d?.id === activeId && d.status === 'en_route');
  const alternatives = useMemo(() => {
    if (!inTrip || !d) return [];
    return recommendHospitals({
      origin: location ?? d.origin,
      caseType: d.caseType,
      severity: d.severity,
      hospitals: hospitals.data,
      now,
      travelMinutesOverride: drivingMinutes,
    }).ranked.filter((r) => r.hospital.id !== d.hospitalId);
  }, [inTrip, d, location, hospitals.data, now, drivingMinutes]);

  const onSwitch = async (rec: Recommendation) => {
    if (!d || !ambulanceId) return;
    try {
      await cancelDispatch(d.id, `switched to ${rec.hospital.name}`);
      const r = await createDispatch({
        ambulanceId,
        hospitalId: rec.hospital.id,
        caseType: d.caseType,
        severity: d.severity,
        origin: location ?? d.origin,
        etaMinutes: rec.travelMinutes,
      });
      if (r.ok) {
        setTripReasons({ dispatchId: r.dispatchId, reasons: ['Chosen manually by the paramedic', ...rec.reasons] });
        toast.success(`${r.bedLabel} reserved at ${rec.hospital.name}`);
      } else {
        toast.error(`${rec.hospital.name} has no free bed any more. Tap GO to pick the best available.`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (!ambulanceId) return <p className="p-6 text-red-700">Your account is not linked to an ambulance.</p>;
  if (ambulance.loading || (activeId && dispatch.loading)) return <Spinner />;

  if (inTrip && d) {
    return (
      <TripView
        dispatch={d}
        callSign={ambulance.data?.callSign ?? ''}
        location={location}
        now={now}
        online={online}
        reasons={tripReasons?.dispatchId === d.id ? tripReasons.reasons : null}
        alternatives={alternatives}
        onSwitch={onSwitch}
      />
    );
  }

  const header = (
    <header className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-bold">🚑 {ambulance.data?.callSign ?? '…'}</h1>
      <span className="flex items-center gap-2 text-sm font-medium" role="status">
        <span className={`h-3 w-3 rounded-full ${online ? 'bg-green-600' : 'bg-red-600'}`} aria-hidden="true" />
        {online ? 'Online' : 'Offline'}
      </span>
    </header>
  );

  // ---- Idle: one big START button ----
  if (!started) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-4 py-6">
        {header}
        <p className="text-center text-slate-600">Ready for the next call.</p>
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="mx-auto mt-8 flex h-56 w-56 items-center justify-center rounded-full bg-red-700 text-4xl font-extrabold tracking-wide text-white shadow-xl hover:bg-red-800 focus-visible:ring-4"
        >
          START
        </button>
        <p className="mt-8 text-center text-sm text-slate-500">
          Tap START when you have a patient. Choose the case type and severity, and the app picks the best hospital and
          reserves a bed.
        </p>
      </div>
    );
  }

  // ---- Setup: case type, severity, location, GO ----
  return (
    <div className="mx-auto max-w-xl px-3 py-4 sm:px-4">
      {header}

      {alert && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border-2 border-red-700 bg-red-50 p-4 text-red-900">
          <span className="text-2xl" aria-hidden="true">
            ⚠
          </span>
          <div className="flex-1">
            <p className="font-bold">Trip ended — {alert}</p>
            <p className="text-sm">Your case details are kept. Tap GO to be sent to the best available hospital.</p>
          </div>
          <button type="button" onClick={() => setAlert(null)} className="rounded px-2 py-1 text-sm font-semibold hover:bg-red-100">
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-5">
        <CaseTypePicker value={caseType} onChange={setCaseType} />
        <SeverityPicker value={severity} onChange={setSeverity} />

        <fieldset>
          <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Your location</legend>
          <p className="rounded-md bg-white p-3 text-sm shadow-sm" role="status">
            {locationLabel ? (
              <>
                📍 <strong>{locationLabel}</strong>
              </>
            ) : geo.error ? (
              <span className="text-red-700">⚠ {geo.error} Choose a location below.</span>
            ) : geo.supported ? (
              'Waiting for GPS… or choose a location below.'
            ) : (
              'GPS not available. Choose a location below.'
            )}
          </p>
          <div className="mt-2 flex gap-2">
            <label htmlFor="preset" className="sr-only">
              Demo location
            </label>
            <select
              id="preset"
              className="min-h-[3rem] flex-1 rounded-md border border-slate-300 bg-white px-3"
              value={manual && DEMO_LOCATIONS.some((x) => x.name === manual.label) ? manual.label : ''}
              onChange={(e) => {
                const loc = DEMO_LOCATIONS.find((x) => x.name === e.target.value);
                if (loc) setManual({ location: loc.location, label: loc.name });
              }}
            >
              <option value="">Quick location…</option>
              {DEMO_LOCATIONS.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-expanded={showMap}
              onClick={() => setShowMap((v) => !v)}
              className="min-h-[3rem] rounded-md border border-slate-300 bg-white px-3 text-sm font-medium"
            >
              {showMap ? 'Hide map' : 'Pick on map'}
            </button>
            {manual && geo.position && (
              <button type="button" onClick={() => setManual(null)} className="min-h-[3rem] rounded-md border border-slate-300 bg-white px-3 text-sm font-medium">
                Use GPS
              </button>
            )}
          </div>
          {showMap && (
            <div className="mt-2">
              <p className="mb-1 text-xs text-slate-500">Tap the map to set your position.</p>
              <HospitalMap
                hospitals={hospitals.data.map((h) => ({ id: h.id, position: h.location, color: MAP_COLORS.unknown, label: h.name }))}
                ambulances={location ? [{ id: 'me', position: location, label: 'You', variant: 'self' }] : []}
                onMapClick={(p) => setManual({ location: p, label: 'Pin on map' })}
                fitKey="setup"
                className="h-64"
              />
            </div>
          )}
        </fieldset>

        <button
          type="button"
          onClick={onGo}
          disabled={!ready || going || hospitals.loading}
          className="w-full rounded-xl bg-green-700 px-4 py-5 text-2xl font-extrabold text-white shadow-lg hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {going ? 'Finding & reserving…' : 'GO'}
        </button>
        {!ready && (
          <p className="-mt-3 text-center text-xs text-slate-500">
            Choose {[!caseType && 'a case type', !severity && 'a severity', !location && 'a location'].filter(Boolean).join(', ')}.
          </p>
        )}
        <p className="-mt-2 text-center text-xs text-slate-500">
          Picks the hospital that can treat this case with the best mix of travel time, free beds and ER crowding, and reserves a bed.
        </p>

        {noHospital && (
          <section role="alert" className="rounded-lg border-2 border-red-700 bg-white p-4">
            <h2 className="font-bold text-red-800">No suitable hospital has a free bed right now</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {noHospital.excluded.map((x) => (
                <li key={x.hospital.id}>
                  <span className="font-medium">✕ {x.hospital.name}</span> — {x.reason}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-slate-600">Beds free up live — tap GO again in a moment.</p>
          </section>
        )}

        <button type="button" onClick={resetForm} className="w-full rounded-md py-2 text-sm text-slate-600 hover:bg-slate-100">
          Back
        </button>
      </div>
    </div>
  );
}
