import { describe, expect, it } from 'vitest';
import { crowdingLevel, crowdRatio, getCrowding, isCountStale } from '../src/lib/crowding';
import { median } from '../src/lib/median';
import { NOW, minutesAgo } from './helpers';

describe('crowdRatio', () => {
  it('divides count by comfort capacity', () => {
    expect(crowdRatio(10, 20)).toBe(0.5);
  });
  it('treats zero capacity as overcrowded only if someone is waiting', () => {
    expect(crowdRatio(0, 0)).toBe(0);
    expect(crowdRatio(3, 0)).toBe(Infinity);
  });
});

describe('crowdingLevel thresholds', () => {
  it.each([
    [0, 'low'],
    [0.59, 'low'],
    [0.6, 'medium'],
    [0.8, 'medium'],
    [1.0, 'medium'],
    [1.01, 'high'],
    [Infinity, 'high'],
  ] as const)('ratio %s → %s', (ratio, level) => {
    expect(crowdingLevel(ratio)).toBe(level);
  });
});

describe('isCountStale', () => {
  it('camera count is fresh up to 10 minutes, stale after', () => {
    expect(isCountStale(minutesAgo(9.9).toDate(), 'camera', NOW)).toBe(false);
    expect(isCountStale(minutesAgo(10).toDate(), 'camera', NOW)).toBe(false);
    expect(isCountStale(minutesAgo(10.1).toDate(), 'camera', NOW)).toBe(true);
  });
  it('a missing timestamp is always stale', () => {
    expect(isCountStale(null, 'camera', NOW)).toBe(true);
    expect(isCountStale(null, 'manual', NOW)).toBe(true);
  });
  it('manual counts do not go stale by default', () => {
    expect(isCountStale(minutesAgo(600).toDate(), 'manual', NOW)).toBe(false);
  });
});

describe('getCrowding', () => {
  const base = { erComfortCapacity: 20, erCountSource: 'camera' as const };

  it('reports the measured level when fresh', () => {
    const c = getCrowding({ ...base, erWaitingCount: 25, erCountUpdatedAt: minutesAgo(1) }, NOW);
    expect(c).toMatchObject({ level: 'high', stale: false, ratio: 1.25, scoringRatio: 1.25 });
  });

  it('reports unknown and scores as ratio 0.8 when the camera is offline', () => {
    const c = getCrowding({ ...base, erWaitingCount: 25, erCountUpdatedAt: minutesAgo(30) }, NOW);
    expect(c).toMatchObject({ level: 'unknown', stale: true, scoringRatio: 0.8 });
  });
});

describe('median', () => {
  it('handles empty, odd and even lists', () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('ignores a single flickering outlier', () => {
    expect(median([6, 6, 7, 6, 0, 6, 6, 15, 6, 6])).toBe(6);
  });
  it('does not mutate its input', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});
