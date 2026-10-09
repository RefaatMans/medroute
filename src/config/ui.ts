import type { BedStatus, CrowdingLevel } from '../types';

/**
 * Status colours (spec 9): green = available / low, yellow = medium, red = full / high,
 * blue = reserved, grey = out of service / unknown. Always paired with an icon + text.
 */
export const BED_STATUS_STYLE: Record<BedStatus, { badge: string; tile: string; icon: string }> = {
  available: { badge: 'bg-green-100 text-green-900 border-green-600', tile: 'border-green-600 bg-green-50', icon: '✓' },
  reserved: { badge: 'bg-blue-100 text-blue-900 border-blue-600', tile: 'border-blue-600 bg-blue-50', icon: '🚑' },
  occupied: { badge: 'bg-red-100 text-red-900 border-red-600', tile: 'border-red-600 bg-red-50', icon: '●' },
  cleaning: { badge: 'bg-yellow-100 text-yellow-900 border-yellow-500', tile: 'border-yellow-500 bg-yellow-50', icon: '🧽' },
  out_of_service: { badge: 'bg-slate-200 text-slate-700 border-slate-500', tile: 'border-slate-400 bg-slate-100', icon: '⛔' },
};

export const CROWD_STYLE: Record<CrowdingLevel | 'unknown', { badge: string; icon: string }> = {
  low: { badge: 'bg-green-100 text-green-900 border-green-600', icon: '▁' },
  medium: { badge: 'bg-yellow-100 text-yellow-900 border-yellow-500', icon: '▄' },
  high: { badge: 'bg-red-100 text-red-900 border-red-600', icon: '█' },
  unknown: { badge: 'bg-slate-200 text-slate-700 border-slate-500', icon: '?' },
};

/** Map marker fills (same meaning as the badges; tooltips carry the text). */
export const MAP_COLORS = {
  best: '#15803d', // green-700
  suitable: '#16a34a', // green-600
  medium: '#ca8a04', // yellow-600
  full: '#b91c1c', // red-700
  reserved: '#1d4ed8', // blue-700
  unknown: '#64748b', // slate-500
} as const;

/** How often "X min ago" labels re-render. */
export const RELATIVE_TIME_REFRESH_MS = 15_000;
