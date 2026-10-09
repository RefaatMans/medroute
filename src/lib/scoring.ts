import { getRequirements } from '../config/caseRules';
import { BED_TYPE_LABELS, CAPABILITY_LABELS, CROWDING_LABELS } from '../config/labels';
import {
  CRITICAL_CROWD_MULTIPLIER,
  CROWD_PENALTY_CAP_MIN,
  CROWD_WEIGHT_MIN,
  LAST_BED_PENALTY_MIN,
} from '../config/routing';
import type { CaseType, ExcludedHospital, Hospital, LatLng, Recommendation, Severity } from '../types';
import { getCrowding } from './crowding';
import { estimateTravelMinutes, haversineKm } from './geo';

export interface RecommendInput {
  origin: LatLng;
  caseType: CaseType;
  severity: Severity;
  hospitals: Hospital[];
  now: Date;
  /** Pre-computed driving minutes by hospital ID (e.g. from OSRM); falls back to the formula. */
  travelMinutesOverride?: Record<string, number>;
}

export interface RecommendResult {
  ranked: Recommendation[];
  excluded: ExcludedHospital[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The routing "brain" (spec section 6). Pure: no Firebase, no clock reads (`now` is passed in).
 * Score = travel minutes + crowding penalty + last-bed penalty. Lower is better.
 */
export function recommendHospitals(input: RecommendInput): RecommendResult {
  const { origin, caseType, severity, hospitals, now, travelMinutesOverride } = input;
  const { capability, bedType } = getRequirements(caseType, severity);
  const bedLabel = BED_TYPE_LABELS[bedType];

  const ranked: Recommendation[] = [];
  const excluded: ExcludedHospital[] = [];

  for (const hospital of hospitals) {
    if (hospital.diverting) {
      excluded.push({ hospital, reason: 'Hospital is on diversion' });
      continue;
    }
    if (!hospital.capabilities.includes(capability)) {
      excluded.push({ hospital, reason: `Cannot treat ${caseType}` });
      continue;
    }
    const availableBeds = hospital.bedSummary[bedType]?.available ?? 0;
    if (availableBeds <= 0) {
      excluded.push({ hospital, reason: `No ${bedLabel} beds free` });
      continue;
    }

    const distanceKm = haversineKm(origin, hospital.location);
    const travelMinutes = travelMinutesOverride?.[hospital.id] ?? estimateTravelMinutes(distanceKm);

    const crowding = getCrowding(hospital, now);
    let crowdPenalty = Math.min(crowding.scoringRatio * CROWD_WEIGHT_MIN, CROWD_PENALTY_CAP_MIN);
    if (severity === 'critical') crowdPenalty *= CRITICAL_CROWD_MULTIPLIER;

    const scarcityPenalty = availableBeds === 1 ? LAST_BED_PENALTY_MIN : 0;
    const score = travelMinutes + crowdPenalty + scarcityPenalty;

    const reasons = [`≈ ${Math.max(1, Math.round(travelMinutes))} min away`];
    reasons.push(
      availableBeds === 1
        ? `Only 1 ${bedLabel} bed free — +${LAST_BED_PENALTY_MIN} min penalty`
        : `${plural(availableBeds, `${bedLabel} bed`)} free`,
    );
    if (crowding.stale) {
      reasons.push('Camera offline — crowding unknown');
    } else {
      const n = hospital.erWaitingCount;
      const people = `${n} ${n === 1 ? 'person' : 'people'}`;
      const penalty = Math.round(crowdPenalty) >= 1 ? ` — +${Math.round(crowdPenalty)} min penalty` : '';
      reasons.push(`ER crowding: ${CROWDING_LABELS[crowding.level]} (${people} waiting)${penalty}`);
    }

    ranked.push({
      hospital,
      bedType,
      availableBeds,
      distanceKm,
      travelMinutes,
      crowdPenalty,
      score,
      crowdingLevel: crowding.level,
      reasons,
    });
  }

  // Array.prototype.sort is stable, so equal scores keep the input order.
  ranked.sort((a, b) => a.score - b.score);

  if (ranked.length > 1) {
    const closest = ranked.reduce((best, r) => (r.travelMinutes < best.travelMinutes ? r : best));
    closest.reasons.push(
      capability === 'general'
        ? 'Closest suitable hospital'
        : `Closest hospital with a ${CAPABILITY_LABELS[capability]} unit`,
    );
  }

  return { ranked, excluded };
}
