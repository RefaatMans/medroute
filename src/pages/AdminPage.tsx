import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import CrowdBadge from '../components/CrowdBadge';
import LastUpdated from '../components/LastUpdated';
import HospitalMap, { type AmbulanceMarker, type HospitalMarker, type MapLine } from '../components/map/HospitalMap';
import SeverityBadge from '../components/SeverityBadge';
import Spinner from '../components/Spinner';
import { BED_TYPE_LABELS, CASE_TYPE_LABELS } from '../config/labels';
import { MAP_COLORS } from '../config/ui';
import { useAmbulances } from '../hooks/useAmbulances';
import { useDispatchSweeper, useOpenDispatches } from '../hooks/useDispatches';
import { useHospitals } from '../hooks/useHospitals';
import { useNow } from '../hooks/useInterval';
import { overviewStatus, type OverviewStatus } from '../lib/hospitalStatus';
import { formatAgo, formatCountdown } from '../lib/time';
import { errorMessage } from '../services/authService';
import { recomputeBedSummary } from '../services/bedService';
import { forceCancelDispatch } from '../services/dispatchService';
import { resetDemo, seedDemoData } from '../services/seed';
import { BED_TYPES } from '../types';

const STATUS_COLOR: Record<OverviewStatus, string> = { ok: MAP_COLORS.suitable, strained: MAP_COLORS.medium, unavailable: MAP_COLORS.full };
const STATUS_TEXT: Record<OverviewStatus, string> = { ok: '● OK', strained: '▲ Strained', unavailable: '✕ Unavailable' };

const buttonClass = 'rounded-md border border-slate-300 bg-white px-4 py-3 font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-50';

export default function AdminPage() {
  const hospitals = useHospitals();
  const ambulances = useAmbulances();
  const open = useOpenDispatches();
  const now = useNow();
  useDispatchSweeper();
  const [busy, setBusy] = useState<null | 'seed' | 'reset' | 'recompute' | string>(null);
  const [showSims, setShowSims] = useState(false);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      toast.success(await fn());
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onSeed = () =>
    run('seed', async () => {
      const r = await seedDemoData();
      return `Seeded ${r.hospitals} hospitals, ${r.beds} beds, ${r.ambulances} ambulances`;
    });
  const onReset = () => {
    if (!window.confirm('Reset the demo? All open trips are cancelled and every bed goes back to its starting state.')) return;
    void run('reset', async () => `Demo reset (${(await resetDemo()).cancelledDispatches} open trips cancelled)`);
  };
  const onRecompute = () =>
    run('recompute', async () => {
      await Promise.all(hospitals.data.map((h) => recomputeBedSummary(h.id)));
      return `Bed summaries rebuilt for ${hospitals.data.length} hospitals`;
    });
  const onForceCancel = (id: string, callSign: string) => {
    if (!window.confirm(`Force-cancel the trip of ${callSign}? Its bed is released.`)) return;
    void run(id, async () => ((await forceCancelDispatch(id)) ? `${callSign}: trip cancelled` : 'Trip was already closed'));
  };

  // ---- Map ----
  const hospitalById = new Map(hospitals.data.map((h) => [h.id, h]));
  const dispatchById = new Map(open.data.map((d) => [d.id, d]));
  const hospitalMarkers: HospitalMarker[] = hospitals.data.map((h) => {
    const s = overviewStatus(h, now);
    return { id: h.id, position: h.location, color: STATUS_COLOR[s.status], label: h.name, detail: `${STATUS_TEXT[s.status]} — ${s.reason}` };
  });
  const visibleAmbulances = ambulances.data.filter((a) => a.location && (showSims || !a.simulated || a.status === 'en_route'));
  const ambulanceMarkers: AmbulanceMarker[] = visibleAmbulances.map((a) => ({
    id: a.id,
    position: a.location!,
    label: a.callSign,
    variant: a.status === 'en_route' ? 'en_route' : 'idle',
  }));
  const lines: MapLine[] = visibleAmbulances.flatMap((a) => {
    const d = a.activeDispatchId ? dispatchById.get(a.activeDispatchId) : undefined;
    const dest = d && hospitalById.get(d.hospitalId);
    return dest ? [{ id: a.id, from: a.location!, to: dest.location }] : [];
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Admin overview</h1>
        <nav className="flex flex-wrap gap-3 text-sm" aria-label="Admin tools">
          <Link to="/simulator" className="font-medium text-red-700 underline">
            Simulator &amp; stress test
          </Link>
          <Link to="/hospital" className="font-medium text-red-700 underline">
            Hospital dashboards
          </Link>
        </nav>
      </div>

      <section className="mt-4 flex flex-wrap gap-3" aria-label="Demo data tools">
        <button type="button" onClick={onSeed} disabled={busy !== null} className="rounded-md bg-red-700 px-4 py-3 font-semibold text-white shadow hover:bg-red-800 disabled:opacity-50">
          {busy === 'seed' ? 'Seeding…' : 'Seed demo data'}
        </button>
        <button type="button" onClick={onReset} disabled={busy !== null} className={buttonClass}>
          {busy === 'reset' ? 'Resetting…' : 'Reset demo'}
        </button>
        <button type="button" onClick={onRecompute} disabled={busy !== null || hospitals.data.length === 0} className={buttonClass}>
          {busy === 'recompute' ? 'Recomputing…' : 'Recompute bed summaries'}
        </button>
      </section>

      <section aria-labelledby="map-heading" className="mt-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="map-heading" className="text-lg font-semibold">
            Live map
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
            <span>
              <span style={{ color: MAP_COLORS.suitable }}>●</span> OK
            </span>
            <span>
              <span style={{ color: MAP_COLORS.medium }}>●</span> Strained (crowded / few beds)
            </span>
            <span>
              <span style={{ color: MAP_COLORS.full }}>●</span> Unavailable (diverting / full)
            </span>
            <span>🚑 white = idle, blue = en route (dashed line to destination)</span>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showSims} onChange={(e) => setShowSims(e.target.checked)} /> Show idle simulated ambulances
            </label>
          </div>
        </div>
        <HospitalMap hospitals={hospitalMarkers} ambulances={ambulanceMarkers} lines={lines} fitKey={String(hospitals.data.length)} className="h-[60vh] min-h-[22rem]" />
      </section>

      <section className="mt-8" aria-labelledby="hospitals-heading">
        <h2 id="hospitals-heading" className="text-lg font-semibold">
          Hospitals
        </h2>
        {hospitals.loading ? (
          <Spinner />
        ) : hospitals.error ? (
          <p role="alert" className="mt-2 text-red-700">
            Could not load hospitals: {hospitals.error.message}
          </p>
        ) : hospitals.data.length === 0 ? (
          <p className="mt-2 text-slate-600">No hospitals yet. Click “Seed demo data”.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="px-3 py-2">Hospital</th>
                  <th className="px-3 py-2">Status</th>
                  {BED_TYPES.map((t) => (
                    <th key={t} className="px-3 py-2 capitalize">
                      {BED_TYPE_LABELS[t]} free
                    </th>
                  ))}
                  <th className="px-3 py-2">Incoming</th>
                  <th className="px-3 py-2">ER waiting</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2">Links</th>
                </tr>
              </thead>
              <tbody>
                {hospitals.data.map((h) => {
                  const s = overviewStatus(h, now);
                  return (
                    <tr key={h.id} className="border-t border-slate-200 align-top">
                      <td className="px-3 py-2 font-medium">
                        {h.name}
                        {h.diverting && <span className="ml-2 rounded bg-red-700 px-1.5 py-0.5 text-xs font-bold text-white">DIVERTING</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{STATUS_TEXT[s.status]}</td>
                      {BED_TYPES.map((t) => {
                        const c = h.bedSummary[t];
                        return (
                          <td key={t} className={`px-3 py-2 tabular-nums ${c && c.available === 0 ? 'font-bold text-red-700' : ''}`}>
                            {c ? `${c.available}/${c.total}` : '—'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 tabular-nums">{h.incomingCount}</td>
                      <td className="px-3 py-2">
                        <CrowdBadge hospital={h} now={now} />
                        <div className="text-xs text-slate-500">{h.erCountSource === 'camera' ? 'camera' : 'manual'}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <LastUpdated at={h.updatedAt} now={now} prefix="" />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link to={`/hospital?h=${h.id}`} className="text-red-700 underline">
                          Dashboard
                        </Link>{' '}
                        ·{' '}
                        <Link to={`/hospital/camera?h=${h.id}`} className="text-red-700 underline">
                          Camera
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="dispatches-heading">
        <h2 id="dispatches-heading" className="text-lg font-semibold">
          Active trips <span className="text-slate-500">({open.data.length})</span>
        </h2>
        {open.error ? (
          <p className="mt-2 text-red-700">Could not load trips: {open.error.message}</p>
        ) : open.data.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No ambulances on the way right now.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="px-3 py-2">Ambulance</th>
                  <th className="px-3 py-2">Case</th>
                  <th className="px-3 py-2">Hospital · bed</th>
                  <th className="px-3 py-2">ETA</th>
                  <th className="px-3 py-2">Dispatched</th>
                  <th className="px-3 py-2">Seen by hospital</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {[...open.data]
                  .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
                  .map((d) => {
                    const created = d.createdAt?.toMillis() ?? now.getTime();
                    return (
                      <tr key={d.id} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-medium">🚑 {d.ambulanceCallSign}</td>
                        <td className="px-3 py-2">
                          <SeverityBadge severity={d.severity} /> {CASE_TYPE_LABELS[d.caseType]}
                        </td>
                        <td className="px-3 py-2">
                          {d.hospitalName} · <strong>{d.bedLabel}</strong>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{formatCountdown(created + d.etaMinutes * 60_000, now.getTime())}</td>
                        <td className="px-3 py-2">{formatAgo(new Date(created), now)}</td>
                        <td className="px-3 py-2">{d.acknowledgedAt ? '✓ Yes' : 'Not yet'}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => onForceCancel(d.id, d.ambulanceCallSign)}
                            className="rounded-md border border-red-700 px-3 py-1.5 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                          >
                            {busy === d.id ? 'Cancelling…' : 'Force cancel'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
