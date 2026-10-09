import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import BedBoard from '../components/BedBoard';
import ErChart from '../components/ErChart';
import CrowdBadge from '../components/CrowdBadge';
import IncomingPanel from '../components/IncomingPanel';
import HospitalPicker from '../components/HospitalPicker';
import LastUpdated from '../components/LastUpdated';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import { BED_TYPE_LABELS } from '../config/labels';
import { useBeds } from '../hooks/useBeds';
import { useDispatchSweeper } from '../hooks/useDispatches';
import { useErReadings } from '../hooks/useErReadings';
import { useHospital } from '../hooks/useHospitals';
import { useNow } from '../hooks/useInterval';
import { useSelectedHospitalId } from '../hooks/useSelectedHospital';
import { errorMessage } from '../services/authService';
import { setDiverting, updateErCount } from '../services/hospitalService';
import { BED_TYPES, type Hospital } from '../types';

export default function HospitalDashboard() {
  const { hospitalId, canChoose, choose } = useSelectedHospitalId();
  const hospital = useHospital(hospitalId);
  const beds = useBeds(hospitalId);
  const erReadings = useErReadings(hospitalId);
  const now = useNow();
  // Staff may only modify their own hospital, so they sweep only it; admins sweep everything.
  useDispatchSweeper(canChoose ? undefined : hospitalId);

  if (!hospitalId) return <p className="p-6 text-red-700">Your account is not linked to a hospital.</p>;
  if (hospital.loading) return <Spinner />;
  if (hospital.error) return <p className="p-6 text-red-700">Could not load hospital: {hospital.error.message}</p>;
  if (!hospital.data) return <p className="p-6 text-slate-600">Hospital not found. Has the demo data been seeded?</p>;
  const h = hospital.data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {h.diverting && (
        <div role="alert" className="mb-4 rounded-md bg-red-700 px-4 py-3 text-center text-lg font-bold text-white">
          ⛔ ON DIVERSION — not receiving ambulances
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{h.name}</h1>
          <p className="text-sm text-slate-600">
            {h.address} · <LastUpdated at={h.updatedAt} now={now} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canChoose && <HospitalPicker value={hospitalId} onChange={choose} />}
          <DiversionToggle hospital={h} />
        </div>
      </header>

      <KpiRow hospital={h} now={now} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <IncomingPanel hospitalId={h.id} now={now} />
          <section aria-labelledby="beds-heading" className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 id="beds-heading" className="mb-3 text-lg font-semibold">
              Bed board
            </h2>
            {beds.loading ? (
              <Spinner />
            ) : beds.error ? (
              <p className="text-red-700">Could not load beds: {beds.error.message}</p>
            ) : (
              <BedBoard hospitalId={h.id} beds={beds.data} now={now} />
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="er-chart-heading" className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 id="er-chart-heading" className="mb-2 font-semibold">
              ER waiting room — last hour
            </h2>
            {erReadings.error ? (
              <p className="text-sm text-red-700">Could not load history: {erReadings.error.message}</p>
            ) : (
              <ErChart readings={erReadings.data} comfortCapacity={h.erComfortCapacity} />
            )}
          </section>
          <ManualErCount hospital={h} />
        </aside>
      </div>
    </div>
  );
}

function KpiRow({ hospital: h, now }: { hospital: Hospital; now: Date }) {
  const types = BED_TYPES.filter((t) => h.bedSummary[t]);
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-600">Available beds</h2>
        <ul className="mt-2 space-y-1">
          {types.map((t) => {
            const c = h.bedSummary[t]!;
            return (
              <li key={t} className="flex justify-between text-sm">
                <span className="capitalize">{BED_TYPE_LABELS[t]}</span>
                <span className={`font-bold tabular-nums ${c.available === 0 ? 'text-red-700' : ''}`}>
                  {c.available}/{c.total}
                  {c.available === 0 && <span className="ml-1 text-xs font-semibold">FULL</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-600">Incoming ambulances</h2>
        <p className="mt-2 text-4xl font-bold tabular-nums">{h.incomingCount}</p>
        <p className="text-xs text-slate-500">heading here now</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
        <h2 className="text-sm font-medium text-slate-600">ER waiting room</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-4xl font-bold tabular-nums">{h.erWaitingCount}</span>
          <span className="text-sm text-slate-600">people (comfortable: {h.erComfortCapacity})</span>
          <CrowdBadge hospital={h} now={now} showCount={false} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Source: {h.erCountSource === 'camera' ? 'AI camera' : 'manual entry'} ·{' '}
          <LastUpdated at={h.erCountUpdatedAt} now={now} prefix="updated" /> ·{' '}
          <Link to={`/hospital/camera?h=${h.id}`} className="font-medium text-red-700 underline">
            Open AI camera
          </Link>
        </p>
      </div>
    </div>
  );
}

function DiversionToggle({ hospital: h }: { hospital: Hospital }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    setBusy(true);
    try {
      await setDiverting(h.id, !h.diverting);
      toast.success(h.diverting ? 'Diversion OFF — receiving ambulances again' : 'Diversion ON — ambulances will be sent elsewhere');
      setConfirming(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={h.diverting}
        onClick={() => setConfirming(true)}
        className={`rounded-md px-4 py-2 font-semibold shadow-sm ${
          h.diverting ? 'bg-red-700 text-white hover:bg-red-800' : 'border border-slate-300 bg-white hover:bg-slate-50'
        }`}
      >
        Diversion: {h.diverting ? 'ON' : 'OFF'}
      </button>
      {confirming && (
        <Modal title={h.diverting ? 'Turn diversion OFF?' : 'Turn diversion ON?'} onClose={() => setConfirming(false)}>
          <p className="text-sm text-slate-700">
            {h.diverting
              ? 'Ambulances will be able to choose this hospital again.'
              : 'Ambulances will stop being sent here. Ambulances already on the way keep their reserved beds.'}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={apply}
              className="flex-1 rounded-md bg-red-700 px-4 py-3 font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            >
              {h.diverting ? 'Turn OFF' : 'Turn ON'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded-md border border-slate-300 px-4 py-3">
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ManualErCount({ hospital: h }: { hospital: Hospital }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Enter a number of people (0 or more).');
      return;
    }
    setBusy(true);
    try {
      const level = await updateErCount(h.id, n, 'manual');
      toast.success(`ER count set to ${Math.round(n)} (${level})`);
      setValue('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-semibold">Manual ER count</h2>
      <p className="mt-1 text-xs text-slate-500">Use when the AI camera is off.</p>
      <label htmlFor="er-count" className="mt-3 block text-sm font-medium">
        People waiting now
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="er-count"
          type="number"
          min={0}
          inputMode="numeric"
          required
          placeholder={String(h.erWaitingCount)}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-24 rounded-md border border-slate-300 px-3 py-2"
        />
        <button type="submit" disabled={busy} className="rounded-md bg-slate-800 px-4 py-2 font-semibold text-white hover:bg-slate-900 disabled:opacity-50">
          Save
        </button>
      </div>
    </form>
  );
}
