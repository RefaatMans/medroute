import { useEffect, useState } from 'react';
import { CROWDING_LABELS } from '../config/labels';
import type { ErReading } from '../types';

interface Props {
  /** Newest first, as returned by `useErReadings`. */
  readings: ErReading[];
  comfortCapacity: number;
}

const HEIGHT = 160;
const PAD = { top: 12, right: 12, bottom: 24, left: 32 };
const LINE = '#334155'; // slate-700: single series, ink-like
const GRID = '#e2e8f0'; // slate-200: recessive
const MUTED = '#64748b'; // slate-500

const timeLabel = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Line chart of ER waiting-room counts with a dashed comfort-capacity reference and hover tooltip. */
export default function ErChart({ readings, comfortCapacity }: Props) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!box) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width)));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  const points = readings
    .filter((r) => r.at)
    .map((r) => ({ t: r.at!.toMillis(), count: r.count, level: r.level }))
    .reverse(); // oldest → newest

  if (points.length < 2) {
    return (
      <div ref={setBox}>
        <p className="text-sm text-slate-600">Not enough history yet. The AI camera adds one point per minute while it runs.</p>
      </div>
    );
  }

  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const yMax = Math.max(comfortCapacity * 1.2, ...points.map((p) => p.count), 1);
  const x = (t: number) => PAD.left + (t1 === t0 ? innerW : ((t - t0) / (t1 - t0)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.count).toFixed(1)}`).join(' ');
  const yTicks = [0, Math.round(yMax / 2), Math.round(yMax)];

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left + PAD.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(points[i].t) - px) < Math.abs(x(points[best].t) - px)) best = i;
    }
    setHover(best);
  };

  const h = hover !== null ? points[hover] : null;

  return (
    <div ref={setBox} className="relative">
      <svg width={width} height={HEIGHT} role="img" aria-label={`ER waiting count over time, latest ${points[points.length - 1].count} people`}>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill={MUTED}>
              {v}
            </text>
          </g>
        ))}
        <line
          x1={PAD.left}
          x2={width - PAD.right}
          y1={y(comfortCapacity)}
          y2={y(comfortCapacity)}
          stroke={MUTED}
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        <text x={width - PAD.right} y={y(comfortCapacity) - 4} textAnchor="end" fontSize={11} fill={MUTED}>
          comfortable ({comfortCapacity})
        </text>
        <text x={PAD.left} y={HEIGHT - 6} fontSize={11} fill={MUTED}>
          {timeLabel(new Date(t0))}
        </text>
        <text x={width - PAD.right} y={HEIGHT - 6} textAnchor="end" fontSize={11} fill={MUTED}>
          {timeLabel(new Date(t1))}
        </text>
        <path d={path} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {h && (
          <>
            <line x1={x(h.t)} x2={x(h.t)} y1={PAD.top} y2={PAD.top + innerH} stroke={MUTED} strokeWidth={1} />
            <circle cx={x(h.t)} cy={y(h.count)} r={4} fill={LINE} stroke="#fff" strokeWidth={2} />
          </>
        )}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          style={{ left: Math.min(x(h.t) + 8, width - 120), top: 0 }}
        >
          <div className="font-semibold text-slate-900">{h.count} people</div>
          <div className="text-slate-600">
            {timeLabel(new Date(h.t))} · {CROWDING_LABELS[h.level]}
          </div>
        </div>
      )}
      <details className="mt-1 text-xs text-slate-600">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-1 w-full">
          <thead>
            <tr className="text-left">
              <th className="pr-2">Time</th>
              <th className="pr-2">People</th>
              <th>Crowding</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.t}>
                <td className="pr-2">{timeLabel(new Date(p.t))}</td>
                <td className="pr-2 tabular-nums">{p.count}</td>
                <td>{CROWDING_LABELS[p.level]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
