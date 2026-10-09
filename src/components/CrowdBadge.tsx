import { CROWDING_LABELS } from '../config/labels';
import { CROWD_STYLE } from '../config/ui';
import { getCrowding } from '../lib/crowding';
import type { Hospital } from '../types';

interface Props {
  hospital: Pick<Hospital, 'erWaitingCount' | 'erComfortCapacity' | 'erCountUpdatedAt' | 'erCountSource'>;
  now: Date;
  /** Also show the number of people waiting. */
  showCount?: boolean;
}

/** ER crowding level with icon + text (never colour alone); "unknown" when the camera is offline. */
export default function CrowdBadge({ hospital, now, showCount = true }: Props) {
  const c = getCrowding(hospital, now);
  const s = CROWD_STYLE[c.level];
  const text =
    c.level === 'unknown'
      ? 'Unknown (camera offline)'
      : `${CROWDING_LABELS[c.level]}${showCount ? ` · ${hospital.erWaitingCount} waiting` : ''}`;
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${s.badge}`}>
      <span aria-hidden="true">{s.icon}</span>
      <span>
        <span className="sr-only">ER crowding: </span>
        {text}
      </span>
    </span>
  );
}
