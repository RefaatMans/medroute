import { SEVERITY_LABELS } from '../config/labels';
import { SEVERITIES, type Severity } from '../types';

const STYLE: Record<Severity, { on: string; off: string; icon: string }> = {
  critical: { on: 'bg-red-700 text-white border-red-700', off: 'border-red-700 text-red-800', icon: '‼' },
  urgent: { on: 'bg-orange-600 text-white border-orange-600', off: 'border-orange-600 text-orange-800', icon: '!' },
  stable: { on: 'bg-green-700 text-white border-green-700', off: 'border-green-700 text-green-800', icon: '✓' },
};

export default function SeverityPicker({ value, onChange }: { value: Severity | null; onChange: (s: Severity) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Severity</legend>
      <div className="grid grid-cols-3 gap-2">
        {SEVERITIES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={value === s}
            onClick={() => onChange(s)}
            className={`min-h-[3.5rem] rounded-lg border-2 text-lg font-bold ${value === s ? STYLE[s].on : `bg-white ${STYLE[s].off}`}`}
          >
            <span aria-hidden="true">{STYLE[s].icon} </span>
            {SEVERITY_LABELS[s]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
