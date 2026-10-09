/** Tunables for travel-time estimation and hospital scoring (spec section 6). */

/** Straight-line distance × this ≈ road distance. */
export const ROAD_FACTOR = 1.4;
/** Average ambulance speed in urban traffic with sirens. */
export const AVG_SPEED_KMH = 40;

/** Minutes of penalty per 1.0 of crowd ratio (count / comfort capacity). */
export const CROWD_WEIGHT_MIN = 15;
/** Maximum crowding penalty in minutes. */
export const CROWD_PENALTY_CAP_MIN = 30;
/** Critical patients skip the waiting room, so crowding matters less. */
export const CRITICAL_CROWD_MULTIPLIER = 0.5;
/** Crowd ratio assumed when the camera is offline (≈ "medium"). */
export const STALE_CROWD_RATIO = 0.8;

/** Penalty for taking a hospital's very last free bed of the needed type. */
export const LAST_BED_PENALTY_MIN = 3;

/** Optional: real driving times from the public OSRM demo server. */
export const USE_OSRM = false;
export const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';
export const OSRM_TIMEOUT_MS = 3000;

