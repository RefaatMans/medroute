import { describe, expect, it } from 'vitest';
import { pushWindow, readingDue, smoothedCount, uploadDecision } from '../src/lib/cameraLogic';

describe('smoothing window', () => {
  it('keeps only the newest N counts', () => {
    let buf: number[] = [];
    for (let i = 1; i <= 12; i++) buf = pushWindow(buf, i, 10);
    expect(buf).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('removes flicker: one missed detection does not change the count', () => {
    expect(smoothedCount([5, 5, 5, 0, 5, 5, 5, 5, 5, 5])).toBe(5);
  });

  it('rounds to whole people', () => {
    expect(smoothedCount([4, 5])).toBe(5); // 4.5 → 5
    expect(smoothedCount([])).toBe(0);
  });
});

describe('uploadDecision', () => {
  const t0 = 1_000_000;

  it('uploads the first value immediately', () => {
    expect(uploadDecision(3, t0, { lastValue: null, lastAt: null })).toBe('change');
  });

  it('uploads a changed count, but not more often than every 5 s', () => {
    const s = { lastValue: 3, lastAt: t0 };
    expect(uploadDecision(4, t0 + 2_000, s)).toBeNull();
    expect(uploadDecision(4, t0 + 5_000, s)).toBe('change');
  });

  it('sends a heartbeat every 30 s even if unchanged', () => {
    const s = { lastValue: 3, lastAt: t0 };
    expect(uploadDecision(3, t0 + 29_000, s)).toBeNull();
    expect(uploadDecision(3, t0 + 30_000, s)).toBe('heartbeat');
  });
});

describe('readingDue', () => {
  it('is due at start and then every 60 s', () => {
    expect(readingDue(0, null)).toBe(true);
    expect(readingDue(59_000, 0)).toBe(false);
    expect(readingDue(60_000, 0)).toBe(true);
  });
});
