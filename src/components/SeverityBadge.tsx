import { SEVERITY_LABELS } from '../config/labels';
import type { Severity } from '../types';

const STYLE: Record<Severity, string> = {
  critical: 'bg-red-700 text-white border-red-700',
  urgent: 'bg-orange-100 text-orange-900 border-orange-600',
  stable: 'bg-green-100 text-green-900 border-green-600',
};
const ICON: Record<Severity, string> = { critical: '‼', urgent: '!', stable: '✓' };

export default function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold uppercase ${STYLE[severity]}`}>
      <span aria-hidden="true">{ICON[severity]}</span>
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
