// Shared domain types. Deliberately free of Firebase imports so `src/lib/*` stays pure;
// Firestore `Timestamp` satisfies `TimestampLike` structurally.

export const BED_TYPES = ['general', 'icu', 'pediatric', 'maternity'] as const;
export type BedType = (typeof BED_TYPES)[number];

export const CAPABILITIES = ['general', 'cardiac', 'stroke', 'trauma', 'burns', 'pediatric', 'maternity'] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CASE_TYPES = [
  'general',
  'cardiac',
  'stroke',
  'trauma',
  'burns',
  'respiratory',
  'pediatric',
  'maternity',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const SEVERITIES = ['critical', 'urgent', 'stable'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const BED_STATUSES = ['available', 'reserved', 'occupied', 'cleaning', 'out_of_service'] as const;
export type BedStatus = (typeof BED_STATUSES)[number];

export const BED_EVENTS = [
  'SENSOR_OCCUPIED',
  'SENSOR_EMPTY',
  'STAFF_MARK_CLEANED',
  'STAFF_PATIENT_ADMITTED',
  'STAFF_OUT_OF_SERVICE',
  'STAFF_BACK_IN_SERVICE',
  'RESERVE',
  'RELEASE',
  'AMBULANCE_ARRIVED',
] as const;
export type BedEvent = (typeof BED_EVENTS)[number];

export type CrowdingLevel = 'low' | 'medium' | 'high';
export type ErCountSource = 'camera' | 'manual';

export const USER_ROLES = ['ambulance', 'hospital', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type AmbulanceStatus = 'idle' | 'en_route';
export type DispatchStatus = 'en_route' | 'arrived' | 'cancelled' | 'declined' | 'expired';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Minimal shape of a Firestore `Timestamp`, so pure code and tests don't depend on Firebase. */
export interface TimestampLike {
  toDate(): Date;
  toMillis(): number;
}

export interface BedCounts {
  total: number;
  available: number;
  reserved: number;
  occupied: number;
  cleaning: number;
  out_of_service: number;
}

export type BedSummary = Partial<Record<BedType, BedCounts>>;

// ---------- Firestore documents (the `id` field is the document ID, not stored in the doc) ----------

/** `hospitals/{hospitalId}` */
export interface Hospital {
  id: string;
  name: string;
  address: string;
  phone: string;
  location: LatLng;
  capabilities: Capability[];
  diverting: boolean;
  erComfortCapacity: number;
  erWaitingCount: number;
  erCrowdingLevel: CrowdingLevel;
  erCountUpdatedAt: TimestampLike | null;
  erCountSource: ErCountSource;
  bedSummary: BedSummary;
  incomingCount: number;
  updatedAt: TimestampLike | null;
}

/** `hospitals/{hospitalId}/beds/{bedId}` */
export interface Bed {
  id: string;
  label: string;
  type: BedType;
  ward: string;
  status: BedStatus;
  sensorOccupied: boolean;
  lastSensorAt: TimestampLike | null;
  reservedByDispatchId: string | null;
  updatedAt: TimestampLike | null;
}

/** `hospitals/{hospitalId}/erReadings/{readingId}` */
export interface ErReading {
  id: string;
  count: number;
  level: CrowdingLevel;
  at: TimestampLike | null;
}

/** `ambulances/{ambulanceId}` */
export interface Ambulance {
  id: string;
  callSign: string;
  location: LatLng | null;
  locationUpdatedAt: TimestampLike | null;
  status: AmbulanceStatus;
  activeDispatchId: string | null;
  simulated: boolean;
}

/** `dispatches/{dispatchId}` */
export interface Dispatch {
  id: string;
  ambulanceId: string;
  ambulanceCallSign: string;
  hospitalId: string;
  hospitalName: string;
  bedId: string;
  bedLabel: string;
  bedType: BedType;
  caseType: CaseType;
  severity: Severity;
  status: DispatchStatus;
  etaMinutes: number;
  origin: LatLng;
  createdAt: TimestampLike | null;
  expiresAt: TimestampLike;
  acknowledgedAt: TimestampLike | null;
  closedAt: TimestampLike | null;
  closedReason: string | null;
}

/** `users/{uid}` */
export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  hospitalId: string | null;
  ambulanceId: string | null;
  createdAt: TimestampLike | null;
}

// ---------- Recommendation output ----------

export interface Recommendation {
  hospital: Hospital;
  bedType: BedType;
  availableBeds: number;
  distanceKm: number;
  travelMinutes: number;
  crowdPenalty: number;
  score: number;
  crowdingLevel: CrowdingLevel | 'unknown';
  reasons: string[];
}

export interface ExcludedHospital {
  hospital: Hospital;
  reason: string;
}
