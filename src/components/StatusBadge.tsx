import { BED_STATUS_LABELS } from '../config/labels';
import { BED_STATUS_STYLE } from '../config/ui';
import type { BedStatus } from '../types';

export default function StatusBadge({ status }: { status: BedStatus }) {
  const s = BED_STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${s.badge}`}>
      <span aria-hidden="true">{s.icon}</span>
      {BED_STATUS_LABELS[status]}
    </span>
  );
}
