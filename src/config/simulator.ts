/** Demo simulator tunables (spec 9.4). */

/** "Random activity" flips one sensor this often. */
export const RANDOM_ACTIVITY_INTERVAL_MS = 10_000;
/** Range of the ER count slider. */
export const ER_SLIDER_MAX = 60;
/** Wait this long after the slider stops moving before writing to Firestore. */
export const ER_SLIDER_DEBOUNCE_MS = 400;
