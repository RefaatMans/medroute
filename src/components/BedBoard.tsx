import { useState } from 'react';
import toast from 'react-hot-toast';
import { BED_EVENT_LABELS, BED_WARDS } from '../config/labels';
import { staffActionsFor, type StaffEvent } from '../lib/bedMachine';
import { compareLabels, formatAgo } from '../lib/time';
import { errorMessage } from '../services/authService';
import { applyBedEvent } from '../services/bedService';
import { BED_TYPES, type Bed } from '../types';
import BedTile from './BedTile';
import Modal from './Modal';
import StatusBadge from './StatusBadge';

const ACTION_STYLE: Record<StaffEvent, string> = {
  STAFF_MARK_CLEANED: 'bg-green-700 text-white hover:bg-green-800',
  STAFF_PATIENT_ADMITTED: 'bg-red-700 text-white hover:bg-red-800',
  STAFF_OUT_OF_SERVICE: 'border border-slate-400 bg-white text-slate-800 hover:bg-slate-50',
  STAFF_BACK_IN_SERVICE: 'bg-slate-700 text-white hover:bg-slate-800',
};

interface Props {
  hospitalId: string;
  beds: Bed[];
  now: Date;
}

/** Bed tiles grouped by ward. Clicking a tile shows only the actions valid for its status. */
export default function BedBoard({ hospitalId, beds, now }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = beds.find((b) => b.id === selectedId) ?? null;

  const run = async (bed: Bed, event: StaffEvent) => {
    setBusy(true);
    try {
      const r = await applyBedEvent(hospitalId, bed.id, event);
      toast.success(`${bed.label}: ${BED_EVENT_LABELS[event]}${r.completedDispatchId ? ' (ambulance trip completed)' : ''}`);
      setSelectedId(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const wards = BED_TYPES.map((type) => ({
    type,
    ward: BED_WARDS[type],
    beds: beds.filter((b) => b.type === type).sort((a, b) => compareLabels(a.label, b.label)),
  })).filter((w) => w.beds.length > 0);

  return (
    <div className="space-y-6">
      {wards.map((w) => (
        <section key={w.type} aria-labelledby={`ward-${w.type}`}>
          <h3 id={`ward-${w.type}`} className="mb-2 font-semibold text-slate-700">
            {w.ward} <span className="font-normal text-slate-500">({w.beds.filter((b) => b.status === 'available').length} available of {w.beds.length})</span>
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {w.beds.map((bed) => (
              <BedTile key={bed.id} bed={bed} now={now} onClick={() => setSelectedId(bed.id)} />
            ))}
          </div>
        </section>
      ))}

      {selected && (
        <Modal title={`Bed ${selected.label}`} onClose={() => setSelectedId(null)}>
          <div className="flex items-center gap-2">
            <StatusBadge status={selected.status} />
            {selected.updatedAt && <span className="text-sm text-slate-600">since {formatAgo(selected.updatedAt.toDate(), now)}</span>}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Sensor: {selected.sensorOccupied ? 'pressure detected' : 'empty'}
            {selected.status === 'reserved' && ' · reserved for an incoming ambulance'}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {staffActionsFor(selected.status).map((event) => (
              <button
                key={event}
                type="button"
                disabled={busy}
                onClick={() => run(selected, event)}
                className={`rounded-md px-4 py-3 font-semibold disabled:opacity-50 ${ACTION_STYLE[event]}`}
              >
                {BED_EVENT_LABELS[event]}
              </button>
            ))}
            <button type="button" onClick={() => setSelectedId(null)} className="rounded-md px-4 py-2 text-slate-600 hover:bg-slate-100">
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
