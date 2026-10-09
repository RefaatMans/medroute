import { CASE_TYPE_LABELS } from '../config/labels';
import { CASE_TYPES, type CaseType } from '../types';

const ICONS: Record<CaseType, string> = {
  general: '🩺',
  cardiac: '❤️',
  stroke: '🧠',
  trauma: '🩹',
  burns: '🔥',
  respiratory: '🫁',
  pediatric: '👶',
  maternity: '🤰',
};

export default function CaseTypePicker({ value, onChange }: { value: CaseType | null; onChange: (c: CaseType) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Case type</legend>
      <div className="grid grid-cols-4 gap-2">
        {CASE_TYPES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            className={`flex min-h-[4.5rem] flex-col items-center justify-center rounded-lg border-2 p-1 text-sm font-semibold ${
              value === c ? 'border-red-700 bg-red-50 text-red-900' : 'border-slate-200 bg-white hover:border-slate-400'
            }`}
          >
            <span className="text-2xl" aria-hidden="true">
              {ICONS[c]}
            </span>
            {CASE_TYPE_LABELS[c]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
