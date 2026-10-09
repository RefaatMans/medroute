import { useState } from 'react';
import toast from 'react-hot-toast';
import { BED_TYPE_LABELS, CASE_TYPE_LABELS } from '../config/labels';
import { MAP_COLORS } from '../config/ui';
import { useHospital } from '../hooks/useHospitals';
import { useInterval } from '../hooks/useInterval';
import { formatCountdown } from '../lib/time';
import { errorMessage } from '../services/authService';
import { cancelDispatch, expireDispatch, markArrived } from '../services/dispatchService';
import type { Dispatch, LatLng, Recommendation } from '../types';
import HospitalMap from './map/HospitalMap';
import Modal from './Modal';
import SeverityBadge from './SeverityBadge';

interface Props {
  dispatch: Dispatch;
  callSign: string;
  location: LatLng | null;
  now: Date;
  online: boolean;
  /** Why the app chose this hospital (null after a page reload). */
  reasons: string[] | null;
  /** Other suitable hospitals, best first, for a manual override. */
  alternatives: Recommendation[];
  onSwitch: (rec: Recommendation) => Promise<void>;
}

/** Paramedic State B: an active trip to a reserved bed (spec 9.2). */
export default function TripView({ dispatch: d, callSign, location, now, online, reasons, alternatives, onSwitch }: Props) {
  const hospital = useHospital(d.hospitalId);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [choosing, setChoosing] = useState(false);

  const etaMs = (d.createdAt?.toMillis() ?? now.getTime()) + d.etaMinutes * 60_000;
  const h = hospital.data;
  const destination = h?.location ?? null;
  const here = location ?? d.origin;

  // Safety net if no hospital tab is open to run the sweeper.
  useInterval(() => {
    if (d.expiresAt.toMillis() < Date.now()) void expireDispatch(d.id).catch(() => undefined);
  }, 30_000);

  const run = async (fn: () => Promise<boolean>, okText: string) => {
    setBusy(true);
    try {
      if (await fn()) toast.success(okText);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 sm:px-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">🚑 {callSign} — en route</h1>
        <span className="flex items-center gap-2 text-sm font-medium" role="status">
          <span className={`h-3 w-3 rounded-full ${online ? 'bg-green-600' : 'bg-red-600'}`} aria-hidden="true" />
          {online ? 'Online' : 'Offline'}
        </span>
      </header>

      <section className="rounded-xl border-2 border-blue-700 bg-white p-4 shadow" aria-labelledby="trip-heading">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-800">Going to</p>
        <h2 id="trip-heading" className="text-2xl font-bold leading-tight">
          {d.hospitalName}
        </h2>
        <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-lg font-bold text-blue-900">
          🛏️ {d.bedLabel} reserved for you <span className="font-normal">({BED_TYPE_LABELS[d.bedType]})</span>
        </p>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">ETA</p>
            <p className="text-4xl font-bold tabular-nums">{formatCountdown(etaMs, now.getTime())}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <SeverityBadge severity={d.severity} />
            <span>{CASE_TYPE_LABELS[d.caseType]}</span>
          </div>
        </div>

        {reasons && (
          <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900">
            <p className="font-semibold">Why this hospital</p>
            <ul className="mt-1 space-y-0.5">
              {reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 text-sm font-medium" role="status" aria-live="polite">
          ✓ Hospital notified
          {d.acknowledgedAt ? (
            <span className="ml-2 font-bold text-green-800">· Hospital has seen your trip ✓</span>
          ) : (
            <span className="ml-2 text-slate-500">· waiting for the hospital to see it…</span>
          )}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {destination && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[3.5rem] items-center justify-center rounded-lg bg-slate-800 px-3 text-center font-bold text-white hover:bg-slate-900"
            >
              🧭 Open navigation
            </a>
          )}
          {h?.phone && (
            <a
              href={`tel:${h.phone.replace(/\s/g, '')}`}
              className="flex min-h-[3.5rem] items-center justify-center rounded-lg border-2 border-slate-800 px-3 text-center font-bold hover:bg-slate-50"
            >
              📞 Call {h.phone}
            </a>
          )}
        </div>
      </section>

      {destination && (
        <div className="mt-4">
          <HospitalMap
            hospitals={[{ id: d.hospitalId, position: destination, color: MAP_COLORS.reserved, label: d.hospitalName, highlight: true }]}
            ambulances={[{ id: 'me', position: here, label: callSign || 'You', variant: 'self' }]}
            lines={[{ id: 'route', from: here, to: destination }]}
            fitKey={d.id}
            className="h-64 sm:h-80"
          />
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => markArrived(d.id), `Arrived — ${d.bedLabel} is now occupied`)}
          className="min-h-[4rem] rounded-lg bg-green-700 text-xl font-bold text-white shadow hover:bg-green-800 disabled:opacity-50"
        >
          ✓ Arrived
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmCancel(true)}
          className="min-h-[4rem] rounded-lg border-2 border-red-700 bg-white text-xl font-bold text-red-800 hover:bg-red-50 disabled:opacity-50"
        >
          Cancel trip
        </button>
      </div>

      <button
        type="button"
        onClick={() => setChoosing(true)}
        className="mt-3 w-full py-2 text-center text-sm text-slate-600 underline hover:text-slate-900"
      >
        Choose a different hospital
      </button>

      {choosing && (
        <Modal title="Choose a different hospital" onClose={() => setChoosing(false)}>
          <p className="text-sm text-slate-700">
            Your bed {d.bedLabel} at {d.hospitalName} is released and a bed is reserved at the hospital you pick.
          </p>
          {alternatives.length === 0 ? (
            <p className="mt-3 text-sm font-medium">No other suitable hospital has a free bed right now.</p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {alternatives.map((rec) => (
                <li key={rec.hospital.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await onSwitch(rec);
                      setBusy(false);
                      setChoosing(false);
                    }}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="block font-semibold">{rec.hospital.name}</span>
                    <span className="block text-xs text-slate-600">
                      ≈ {Math.max(1, Math.round(rec.travelMinutes))} min · {rec.availableBeds} {BED_TYPE_LABELS[rec.bedType]} bed
                      {rec.availableBeds === 1 ? '' : 's'} free · ER {rec.crowdingLevel}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setChoosing(false)} className="mt-3 w-full rounded-md border border-slate-300 px-4 py-2">
            Keep {d.hospitalName}
          </button>
        </Modal>
      )}

      {confirmCancel && (
        <Modal title="Cancel this trip?" onClose={() => setConfirmCancel(false)}>
          <p className="text-sm text-slate-700">
            Bed {d.bedLabel} at {d.hospitalName} will be released for other ambulances.
          </p>
          <label htmlFor="cancel-reason" className="mt-3 block text-sm font-medium">
            Reason (optional)
          </label>
          <input
            id="cancel-reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="e.g. Patient refused transport"
          />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await run(() => cancelDispatch(d.id, cancelReason), 'Trip cancelled, bed released');
                setConfirmCancel(false);
              }}
              className="flex-1 rounded-md bg-red-700 px-4 py-3 font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              Cancel trip
            </button>
            <button type="button" onClick={() => setConfirmCancel(false)} className="flex-1 rounded-md border border-slate-300 px-4 py-3">
              Keep going
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
