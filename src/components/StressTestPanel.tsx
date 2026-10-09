import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { STRESS_TEST_DEFAULT_AMBULANCES, STRESS_TEST_FREE_BEDS } from '../config/dispatch';
import { BED_TYPE_LABELS } from '../config/labels';
import { errorMessage } from '../services/authService';
import { cleanUpStressTest, fireStressTest, prepareStressTest, type StressResult } from '../services/stressTest';
import { BED_TYPES, type BedType, type Hospital } from '../types';

const MAX_AMBULANCES = 10; // number of seeded simulated ambulances

/** Spec 9.4 step 5: "the 5 ambulances, 3 beds test" for the reservation flag. */
export default function StressTestPanel({ hospital: h }: { hospital: Hospital }) {
  const types = BED_TYPES.filter((t) => (h.bedSummary[t]?.total ?? 0) >= STRESS_TEST_FREE_BEDS);
  const [bedType, setBedType] = useState<BedType>(types.includes('icu') ? 'icu' : types[0]);
  const [n, setN] = useState(STRESS_TEST_DEFAULT_AMBULANCES);
  const [busy, setBusy] = useState<null | 'prepare' | 'fire' | 'clean'>(null);
  const [progress, setProgress] = useState('');
  const [prepared, setPrepared] = useState<number | null>(null);
  const [results, setResults] = useState<StressResult[] | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!types.includes(bedType)) setBedType(types[0]);
    setPrepared(null);
    setResults(null);
  }, [h.id]);

  const c = h.bedSummary[bedType];
  const wins = results?.filter((r) => r.result.ok) ?? [];
  const winBeds = wins.map((r) => (r.result.ok ? r.result.bedLabel : ''));
  const expected = prepared === null ? null : Math.min(prepared, n);
  const pass =
    results !== null &&
    expected !== null &&
    wins.length === expected &&
    new Set(winBeds).size === winBeds.length &&
    results.every((r) => r.result.ok || r.result.code === 'NO_BED');

  const onPrepare = async () => {
    setBusy('prepare');
    setResults(null);
    try {
      const r = await prepareStressTest(h.id, bedType, STRESS_TEST_FREE_BEDS, (done, total) => setProgress(`${done}/${total} beds`));
      setPrepared(r.free);
      toast.success(`Ready: exactly ${r.free} ${BED_TYPE_LABELS[bedType]} beds available, ${r.total - r.free} occupied`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  const onFire = async () => {
    setBusy('fire');
    try {
      const t0 = performance.now();
      const r = await fireStressTest(h.id, bedType, n);
      setElapsedMs(performance.now() - t0);
      setResults(r);
      toast(`${r.filter((x) => x.result.ok).length} of ${r.length} ambulances got a bed`, { icon: '🚑' });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onClean = async () => {
    setBusy('clean');
    try {
      const ids = wins.map((r) => (r.result.ok ? r.result.dispatchId : ''));
      const cancelled = await cleanUpStressTest(ids);
      toast.success(`Cleaned up: ${cancelled} test trips cancelled, beds released`);
      setResults(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="stress-heading" className="mt-6 rounded-lg border-2 border-slate-800 bg-white p-4">
      <h2 id="stress-heading" className="text-lg font-semibold">
        Stress test — {n} ambulances, {STRESS_TEST_FREE_BEDS} beds
      </h2>
      <p className="text-sm text-slate-600">
        Proves no two ambulances can get the same bed: {n} simulated ambulances ask {h.name} for a bed at exactly the same moment.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          Bed type
          <select
            value={bedType}
            onChange={(e) => {
              setBedType(e.target.value as BedType);
              setPrepared(null);
              setResults(null);
            }}
            className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {BED_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Ambulances (N)
          <input
            type="number"
            min={1}
            max={MAX_AMBULANCES}
            value={n}
            onChange={(e) => setN(Math.min(MAX_AMBULANCES, Math.max(1, Number(e.target.value) || 1)))}
            className="mt-1 block w-24 rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={onPrepare}
          disabled={busy !== null}
          className="rounded-md border border-slate-800 bg-white px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === 'prepare' ? `Preparing… ${progress}` : `1. Prepare (${STRESS_TEST_FREE_BEDS} free)`}
        </button>
        <button
          type="button"
          onClick={onFire}
          disabled={busy !== null || prepared === null || results !== null}
          className="rounded-md bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {busy === 'fire' ? 'Firing…' : `2. Fire ${n} simultaneous requests`}
        </button>
        <button
          type="button"
          onClick={onClean}
          disabled={busy !== null || wins.length === 0}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === 'clean' ? 'Cleaning…' : '3. Clean up'}
        </button>
      </div>

      {c && (
        <p className="mt-3 text-sm" aria-live="polite">
          Live at {h.name} ({BED_TYPE_LABELS[bedType]}): <strong>{c.available}</strong> available · <strong>{c.reserved}</strong> reserved ·{' '}
          {c.occupied} occupied · incoming ambulances <strong>{h.incomingCount}</strong>
        </p>
      )}

      {results && (
        <div className="mt-4">
          <div
            role="status"
            className={`rounded-md px-4 py-3 font-bold ${pass ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}
          >
            {pass ? '✅ PASS' : '❌ CHECK'} — {wins.length} succeeded, {results.length - wins.length} redirected (expected {expected} and{' '}
            {results.length - (expected ?? 0)}), {new Set(winBeds).size} different beds, in {Math.round(elapsedMs)} ms.
          </div>
          <table className="mt-3 w-full max-w-lg text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-3">Ambulance</th>
                <th className="py-1">Result</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.ambulanceId} className="border-b border-slate-100">
                  <td className="py-1 pr-3 font-medium">{r.callSign}</td>
                  <td className="py-1">
                    {r.result.ok ? (
                      <span className="text-green-800">✅ bed {r.result.bedLabel} reserved</span>
                    ) : (
                      <span className="text-red-800">
                        ❌ {r.result.code}
                        {r.result.code === 'NO_BED' && ' — redirected'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
