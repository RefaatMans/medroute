/** Dispatch / reservation tunables (spec 7.2, 7.3, 9.4). */

/** A reservation expires this many minutes after the ETA if the ambulance never arrives. */
export const DISPATCH_EXPIRY_BUFFER_MIN = 20;
/** How often open tabs sweep for expired dispatches. */
export const SWEEPER_INTERVAL_SEC = 60;
/** How many free beds `createDispatch` tries before giving up with NO_BED. */
export const CANDIDATE_BED_LIMIT = 5;
/** How often the paramedic's GPS position is written to the ambulance doc. */
export const LOCATION_UPLOAD_INTERVAL_SEC = 30;

/** Stress test defaults ("5 ambulances, 3 beds"). */
export const STRESS_TEST_DEFAULT_AMBULANCES = 5;
export const STRESS_TEST_FREE_BEDS = 3;
