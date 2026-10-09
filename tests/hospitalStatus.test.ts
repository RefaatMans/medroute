import { describe, expect, it } from 'vitest';
import { overviewStatus } from '../src/lib/hospitalStatus';
import { counts, makeHospital, NOW } from './helpers';

describe('overviewStatus', () => {
  it('is unavailable when diverting or with no free beds', () => {
    expect(overviewStatus(makeHospital({ id: 'a', diverting: true }), NOW).status).toBe('unavailable');
    expect(overviewStatus(makeHospital({ id: 'a', bedSummary: { general: counts(0), icu: counts(0) } }), NOW)).toEqual({
      status: 'unavailable',
      reason: 'No free beds',
    });
  });

  it('is strained when the ER is crowded or beds are scarce', () => {
    expect(overviewStatus(makeHospital({ id: 'a', erWaitingCount: 40 }), NOW).status).toBe('strained');
    expect(overviewStatus(makeHospital({ id: 'a', bedSummary: { general: counts(1), icu: counts(1) } }), NOW).reason).toBe('Only 2 beds free');
  });

  it('is ok otherwise', () => {
    expect(overviewStatus(makeHospital({ id: 'a' }), NOW)).toEqual({ status: 'ok', reason: '20 beds free' });
  });
});
