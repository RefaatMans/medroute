import { BED_STATUS_STYLE } from '../config/ui';
import { formatDuration } from '../lib/time';
import type { Bed } from '../types';
import StatusBadge from './StatusBadge';

interface Props {
  bed: Bed;
  now: Date;
  onClick?: () => void;
}

/** One bed: label, status (icon + text + colour) and time in that status. */
export default function BedTile({ bed, now, onClick }: Props) {
  const since = bed.updatedAt ? formatDuration(now.getTime() - bed.updatedAt.toMillis()) : '—';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[5.5rem] w-full flex-col items-start gap-1 rounded-md border-2 p-2 text-left shadow-sm transition hover:shadow-md ${BED_STATUS_STYLE[bed.status].tile}`}
      aria-label={`${bed.label}, ${bed.status.replace('_', ' ')} for ${since}. Show actions`}
    >
      <span className="font-bold">{bed.label}</span>
      <StatusBadge status={bed.status} />
      <span className="text-xs text-slate-600">for {since}</span>
    </button>
  );
}
