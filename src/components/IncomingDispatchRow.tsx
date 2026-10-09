import { useState } from 'react';
import toast from 'react-hot-toast';
import { BED_TYPE_LABELS, CASE_TYPE_LABELS } from '../config/labels';
import { formatAgo, formatCountdown } from '../lib/time';
import { errorMessage } from '../services/authService';
import { applyBedEvent } from '../services/bedService';
import { acknowledgeDispatch } from '../services/dispatchService';
import type { Dispatch } from '../types';
import SeverityBadge from './SeverityBadge';

interface Props {
  dispatch: Dispatch;
  now: Date;
  isNew: boolean;
}

/**
 * One incoming ambulance. Hospitals cannot reject an ambulance (the bed is already reserved);
 * a hospital that can't take more patients switches on Diversion instead.
 */
export default function IncomingDispatchRow({ dispatch: d, now, isNew }: Props) {
  const [busy, setBusy] = useState(false);

  const createdMs = d.createdAt?.toMillis() ?? now.getTime();
  const etaMs = createdMs + d.etaMinutes * 60_000;

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(`${d.ambulanceCallSign}: ${label}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`rounded-lg border-2 p-3 transition-colors ${isNew ? 'animate-pulse border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold">🚑 {d.ambulanceCallSign}</span>
        {isNew && <span className="rounded bg-blue-700 px-2 py-0.5 text-xs font-bold text-white">NEW</span>}
        <SeverityBadge severity={d.severity} />
        <span className="text-sm font-medium">{CASE_TYPE_LABELS[d.caseType]}</span>
        <span className="ml-auto text-right">
          <span className="block text-xl font-bold tabular-nums">ETA {formatCountdown(etaMs, now.getTime())}</span>
          <span className="block text-xs text-slate-500">dispatched {formatAgo(new Date(createdMs), now)}</span>
        </span>
      </div>
      <p className="mt-1 text-sm">
        Bed reserved: <strong>{d.bedLabel}</strong> ({BED_TYPE_LABELS[d.bedType]})
        {d.acknowledgedAt && <span className="ml-2 font-semibold text-green-800">· Seen ✓</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {!d.acknowledgedAt && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act('marked as seen', () => acknowledgeDispatch(d.id))}
            className="rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            Mark as seen
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => act(`patient admitted to ${d.bedLabel}`, () => applyBedEvent(d.hospitalId, d.bedId, 'STAFF_PATIENT_ADMITTED'))}
          className="rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
        >
          Patient admitted
        </button>
      </div>
    </li>
  );
}
