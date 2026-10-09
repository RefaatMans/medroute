/** ER crowding thresholds (spec 4.7). Ratio = people waiting / comfort capacity. */

/** Below this ratio → 'low'. */
export const LOW_MAX_RATIO = 0.6;
/** Above this ratio → 'high'. Between the two (inclusive) → 'medium'. */
export const HIGH_MIN_RATIO = 1.0;

/** A camera count older than this is treated as "unknown (camera offline)". */
export const CAMERA_STALE_MINUTES = 10;

/**
 * How long a manually entered count stays valid. `null` = never goes stale.
 * Staff type a manual count precisely because there is no camera, so the camera
 * staleness rule doesn't apply to it by default.
 */
export const MANUAL_COUNT_STALE_MINUTES: number | null = null;
