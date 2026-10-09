import { describe, expect, it } from 'vitest';
import { compareLabels, formatAgo, formatCountdown, formatDuration } from '../src/lib/time';

const now = new Date('2026-10-09T12:00:00Z');
const ago = (sec: number) => new Date(now.getTime() - sec * 1000);

describe('formatAgo', () => {
  it.each([
    [0, 'just now'],
    [30, 'just now'],
    [60, '1 min ago'],
    [5 * 60, '5 min ago'],
    [2 * 3600, '2 h ago'],
    [86400, '1 day ago'],
    [3 * 86400, '3 days ago'],
  ])('%i s → %s', (sec, text) => expect(formatAgo(ago(sec), now)).toBe(text));

  it('treats future times (clock skew) as just now', () => {
    expect(formatAgo(new Date(now.getTime() + 5000), now)).toBe('just now');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '< 1 min'],
    [59_000, '< 1 min'],
    [12 * 60_000, '12 min'],
    [185 * 60_000, '3 h 05 min'],
    [50 * 3600_000, '2 d'],
  ])('%i ms → %s', (ms, text) => expect(formatDuration(ms)).toBe(text));
});

describe('formatCountdown', () => {
  const t = now.getTime();
  it.each([
    [6 * 60_000, '6 min'],
    [30_000, '< 1 min'],
    [-30_000, '< 1 min'],
    [-3 * 60_000, 'overdue 3 min'],
  ])('%i ms left → %s', (left, text) => expect(formatCountdown(t + left, t)).toBe(text));
});

describe('compareLabels', () => {
  it('sorts numerically', () => {
    expect(['GEN-10', 'GEN-2', 'GEN-1'].sort(compareLabels)).toEqual(['GEN-1', 'GEN-2', 'GEN-10']);
  });
});
