/**
 * Thermal-camera look for the people counter (prototype).
 *
 * We do NOT have a real thermal sensor. This maps the brightness of an ordinary
 * video frame onto a thermal-style gradient so the feed reads as "thermal camera"
 * in a demo. Counting still runs on the original RGB frame (see CameraPage), so
 * accuracy is unchanged — only what the operator sees is recolored.
 */

/** A colour stop on the gradient: position 0..1 and its [r,g,b]. */
type Stop = readonly [pos: number, r: number, g: number, b: number];

/** Classic "ironbow"-style ramp: cold black/blue → warm red/orange → hot white. */
const RAMP: readonly Stop[] = [
  [0.0, 0, 0, 0],
  [0.15, 20, 0, 60],
  [0.35, 110, 0, 110],
  [0.55, 200, 30, 40],
  [0.75, 245, 120, 0],
  [0.9, 255, 220, 40],
  [1.0, 255, 255, 255],
];

/** 256-entry lookup table, built once, so per-pixel mapping is a single array read. */
const LUT = buildLut();

function buildLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = RAMP[0];
    let b = RAMP[RAMP.length - 1];
    for (let s = 0; s < RAMP.length - 1; s++) {
      if (t >= RAMP[s][0] && t <= RAMP[s + 1][0]) {
        a = RAMP[s];
        b = RAMP[s + 1];
        break;
      }
    }
    const span = b[0] - a[0] || 1;
    const f = (t - a[0]) / span;
    lut[i * 3] = a[1] + (b[1] - a[1]) * f;
    lut[i * 3 + 1] = a[2] + (b[2] - a[2]) * f;
    lut[i * 3 + 2] = a[3] + (b[3] - a[3]) * f;
  }
  return lut;
}

/** Perceived brightness (Rec. 601 luma) for one RGB pixel, 0..255. */
export function luma(r: number, g: number, b: number): number {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Recolors an RGBA pixel buffer in place: each pixel's brightness becomes a
 * thermal colour. Alpha is preserved. Mutates and returns the same array.
 */
export function applyThermal(data: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    const y = luma(data[i], data[i + 1], data[i + 2]) | 0;
    const j = y * 3;
    data[i] = LUT[j];
    data[i + 1] = LUT[j + 1];
    data[i + 2] = LUT[j + 2];
  }
  return data;
}
