import type { BedType, Capability, CaseType, Severity } from '../types';

interface CaseRule {
  capability: Capability;
  criticalBedType: BedType;
  defaultBedType: BedType;
}

/** Spec 4.4: which capability a case needs and which bed type it occupies. */
export const CASE_RULES: Record<CaseType, CaseRule> = {
  general: { capability: 'general', criticalBedType: 'icu', defaultBedType: 'general' },
  cardiac: { capability: 'cardiac', criticalBedType: 'icu', defaultBedType: 'general' },
  stroke: { capability: 'stroke', criticalBedType: 'icu', defaultBedType: 'general' },
  trauma: { capability: 'trauma', criticalBedType: 'icu', defaultBedType: 'general' },
  burns: { capability: 'burns', criticalBedType: 'icu', defaultBedType: 'general' },
  respiratory: { capability: 'general', criticalBedType: 'icu', defaultBedType: 'general' },
  pediatric: { capability: 'pediatric', criticalBedType: 'pediatric', defaultBedType: 'pediatric' },
  maternity: { capability: 'maternity', criticalBedType: 'maternity', defaultBedType: 'maternity' },
};

export function getRequirements(caseType: CaseType, severity: Severity): { capability: Capability; bedType: BedType } {
  const rule = CASE_RULES[caseType];
  return {
    capability: rule.capability,
    bedType: severity === 'critical' ? rule.criticalBedType : rule.defaultBedType,
  };
}
