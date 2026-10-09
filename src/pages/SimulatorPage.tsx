import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import CrowdBadge from '../components/CrowdBadge';
import HospitalPicker from '../components/HospitalPicker';
import Spinner from '../components/Spinner';
import StressTestPanel from '../components/StressTestPanel';
import StatusBadge from '../components/StatusBadge';
import { BED_STATUS_LABELS, BED_WARDS } from '../config/labels';
import { ER_SLIDER_DEBOUNCE_MS, ER_SLIDER_MAX, RANDOM_ACTIVITY_INTERVAL_MS } from '../config/simulator';
import { BED_STATUS_STYLE } from '../config/ui';
import { useBeds } from '../hooks/useBeds';
import { useHospital } from '../hooks/useHospitals';
import { useInterval, useNow } from '../hooks/useInterval';
import { useSelectedHospitalId } from '../hooks/useSelectedHospital';
import { compareLabels } from '../lib/time';
import { errorMessage } from '../services/authService';
import { applySensorReading } from '../services/bedService';
import { updateErCount } from '../services/hospitalService';
import { BED_TYPES, type Bed } from '../types';
import { useDispatchSweeper } from '../hooks/useDispatches';

// Sensor simulator, random activity, ER slider and the reservation stress test (spec 9.4).
export default function SimulatorPage() {
  const { hospitalId, choose } = useSelectedHospitalId();
  const hospital = useHospital(hospitalId);
  const beds = useBeds(hospitalId);
  const now = useNow();
  useDispatchSweeper();
  const [random, setRandom] = useState(false);

  const toggleSensor = async (bed: Bed, occupied: boolean, quiet = false) => {
    try {
      const r = await applySensorReading(hospitalId!, bed.id, occupied);
      if (quiet) return;
      if (r.changed) {
        toast.success(`${bed.label}: ${BED_STATUS_LABELS[r.from]} → ${BED_STATUS_LABELS[r.to]}`);
      } else {
        toast(`${bed.label}: sensor ${occupied ? 'occupied' : 'empty'} (status stays ${BED_STATUS_LABELS[r.to].toLowerCase()})`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // Random activity: a patient lies down on a free bed, or a patient leaves an occupied one.
  // Reserved beds are left alone (their ambulance hasn't arrived yet).
  useInterval(
    () => {
      const candidates = beds.data.filter((b) => b.status === 'available' || b.status === 'occupied');
      if (candidates.length === 0) return;
      const bed = candidates[Math.floor(Math.random() * candidates.length)];
      void toggleSensor(bed, bed.status === 'available', true);
      toast(`Random activity: ${bed.label} sensor → ${bed.status === 'available' ? 'occupied' : 'empty'}`, { icon: '🎲' });
    },
    random && hospitalId ? RANDOM_ACTIVITY_INTERVAL_MS : null,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-bold">Demo simulator</h1>
      <p className="text-sm text-slate-600">Simulates the bed pressure sensors and the ER waiting room count.</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <HospitalPicker value={hospitalId} onChange={choose} />
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={random} onChange={(e) => setRandom(e.target.checked)} className="h-5 w-5" />
          Random activity (every {RANDOM_ACTIVITY_INTERVAL_MS / 1000} s)
        </label>
      </div>

      {hospital.data && <ErSlider hospitalId={hospital.data.id} count={hospital.data.erWaitingCount} />}
      {hospital.data && (
        <p className="mt-2 text-sm">
          Current ER crowding: <CrowdBadge hospital={hospital.data} now={now} />
        </p>
      )}

      {hospital.data && <StressTestPanel hospital={hospital.data} />}

      <section aria-labelledby="sensors-heading" className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 id="sensors-heading" className="text-lg font-semibold">
          Pressure sensors
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          Each switch is what a real bed sensor would report. Occupied → empty moves the bed to <em>cleaning</em>, not available.
        </p>
        {beds.loading ? (
          <Spinner />
        ) : beds.error ? (
          <p className="text-red-700">Could not load beds: {beds.error.message}</p>
        ) : (
          BED_TYPES.map((type) => {
            const ward = beds.data.filter((b) => b.type === type).sort((a, b) => compareLabels(a.label, b.label));
            if (ward.length === 0) return null;
            return (
              <div key={type} className="mb-4">
                <h3 className="mb-2 font-semibold text-slate-700">{BED_WARDS[type]}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {ward.map((bed) => (
                    <div key={bed.id} className={`rounded-md border-2 p-2 ${BED_STATUS_STYLE[bed.status].tile}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{bed.label}</span>
                        <StatusBadge status={bed.status} />
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={bed.sensorOccupied}
                        aria-label={`${bed.label} sensor`}
                        onClick={() => toggleSensor(bed, !bed.sensorOccupied)}
                        className={`mt-2 w-full rounded px-2 py-2 text-sm font-semibold ${
                          bed.sensorOccupied ? 'bg-slate-800 text-white' : 'border border-slate-400 bg-white text-slate-800'
                        }`}
                      >
                        Sensor: {bed.sensorOccupied ? 'occupied' : 'empty'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function ErSlider({ hospitalId, count }: { hospitalId: string; count: number }) {
  const [value, setValue] = useState(count);
  const dragging = useRef(false);
  const timer = useRef<number>();

  // Follow live updates (e.g. from the camera) unless the user is moving the slider.
  useEffect(() => {
    if (!dragging.current) setValue(count);
  }, [count]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onChange = (v: number) => {
    dragging.current = true;
    setValue(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const level = await updateErCount(hospitalId, v, 'manual');
        toast.success(`ER count → ${v} (${level})`, { id: 'er-slider' });
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        dragging.current = false;
      }
    }, ER_SLIDER_DEBOUNCE_MS);
  };

  return (
    <div className="mt-4 max-w-md">
      <label htmlFor="er-slider" className="block text-sm font-medium">
        ER waiting count: <span className="font-bold tabular-nums">{value}</span>
      </label>
      <input
        id="er-slider"
        type="range"
        min={0}
        max={ER_SLIDER_MAX}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </div>
  );
}
