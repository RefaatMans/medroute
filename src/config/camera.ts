/** AI camera tunables (spec 9.5). */

/** Model variant passed to `cocoSsd.load`. Lite = fast enough for laptops and phones. */
export const MODEL_BASE = 'lite_mobilenet_v2' as const;
/** Minimum time between two detections. */
export const DETECT_INTERVAL_MS = 700;
/** Detections below this confidence are ignored. */
export const PERSON_MIN_SCORE = 0.5;
/** Number of recent counts the median is taken over. */
export const SMOOTHING_WINDOW = 10;
/** Upload a changed count at most this often. */
export const UPLOAD_MIN_INTERVAL_MS = 5_000;
/** Upload even an unchanged count this often, so the hospital isn't marked stale. */
export const HEARTBEAT_MS = 30_000;
/** Append a history point for the chart this often. */
export const READING_INTERVAL_MS = 60_000;
/** Upper limit of boxes per frame (crowded waiting rooms can exceed the library default of 20). */
export const MAX_DETECTIONS = 60;
/** Number of history points shown on the ER chart. */
export const ER_READINGS_LIMIT = 60;
