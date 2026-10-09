import type { BedEvent, BedStatus, BedType, Capability, CaseType, CrowdingLevel, Severity } from '../types';

/** Human-readable names used in the UI and in recommendation reasons. */

export const BED_TYPE_LABELS: Record<BedType, string> = {
  general: 'general',
  icu: 'ICU',
  pediatric: 'pediatric',
  maternity: 'maternity',
};

export const BED_WARDS: Record<BedType, string> = {
  general: 'General Ward',
  icu: 'Intensive Care',
  pediatric: 'Pediatrics',
  maternity: 'Maternity',
};

export const BED_LABEL_PREFIX: Record<BedType, string> = {
  general: 'GEN',
  icu: 'ICU',
  pediatric: 'PED',
  maternity: 'MAT',
};

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  general: 'General',
  cardiac: 'Cardiac',
  stroke: 'Stroke',
  trauma: 'Trauma',
  burns: 'Burns',
  respiratory: 'Respiratory',
  pediatric: 'Pediatric',
  maternity: 'Maternity',
};

export const CAPABILITY_LABELS: Record<Capability, string> = {
  general: 'general',
  cardiac: 'cardiac',
  stroke: 'stroke',
  trauma: 'trauma',
  burns: 'burns',
  pediatric: 'pediatric',
  maternity: 'maternity',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  urgent: 'Urgent',
  stable: 'Stable',
};

export const BED_STATUS_LABELS: Record<BedStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  occupied: 'Occupied',
  cleaning: 'Cleaning',
  out_of_service: 'Out of service',
};

export const BED_EVENT_LABELS: Record<BedEvent, string> = {
  SENSOR_OCCUPIED: 'Sensor: occupied',
  SENSOR_EMPTY: 'Sensor: empty',
  STAFF_MARK_CLEANED: 'Mark cleaned',
  STAFF_PATIENT_ADMITTED: 'Patient admitted',
  STAFF_OUT_OF_SERVICE: 'Out of service',
  STAFF_BACK_IN_SERVICE: 'Back in service',
  RESERVE: 'Reserve',
  RELEASE: 'Release',
  AMBULANCE_ARRIVED: 'Ambulance arrived',
};

export const CROWDING_LABELS: Record<CrowdingLevel | 'unknown', string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  unknown: 'UNKNOWN',
};
