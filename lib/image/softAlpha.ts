/**
 * Soft-alpha artwork detection and passthrough for decoded source pixels.
 *
 * The 5x5 median denoise damages soft anti-aliased edges on flat artwork:
 * anti-aliased fringe pixels carry partial alpha and colors blended with
 * the background, so the median shifts those colors while the tracer
 * would have reproduced the raw edge faithfully. The honest end-to-end
 * parity metric measures that damage directly (parity harness, honest
 * metric: wikipedia_logo 0.9163 with the median in the path, 0.9386 with
 * the median and the edge restore skipped).
 *
 * The gate is conservative and fires only on flat art with soft
 * translucency: at least 1% of pixels must be partially transparent
 * (alpha strictly between 0 and 255, so anti-aliased edges are a real
 * feature of the image) AND the median must rewrite at least 10% of
 * pixels by more than 8 in some channel (the median is changing those
 * soft edges, not idle). Parity harness: the gate fires only on
 * wikipedia_logo across the 18-image suite (transparency.png has 50%
 * partial alpha but the median rewrites 0.01% of it; Luca's sprites have
 * 1.6-2.5% partial alpha but the median rewrites under 1% of them;
 * goose_balloon has 0.95% partial alpha, just under the gate, and a
 * 0.9% rewrite).
 */

import { noiseFraction } from "./unsharpMask";

const SOFT_ALPHA_MIN_PARTIAL_FRACTION = 0.01;
const SOFT_ALPHA_MIN_REWRITE_FRACTION = 0.1;

/**
 * Fraction of pixels that are partially transparent (alpha strictly
 * between 0 and 255). Fully transparent pixels are excluded: they are
 * background keying, not soft edges.
 */
export function partialAlphaFraction(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): number {
  const n = Math.min(pixels.length / 4, width * height);
  if (n === 0) {
    return 0;
  }
  let partial = 0;
  for (let i = 0; i < n; i += 1) {
    const a = pixels[i * 4 + 3];
    if (a > 0 && a < 255) {
      partial += 1;
    }
  }
  return partial / n;
}

/**
 * True when the image is flat artwork with soft anti-aliased edges the
 * 5x5 median would damage: partial alpha is a real feature of the image
 * and the median rewrites many pixels. `denoised` must be the 5x5 median
 * of `raw` (already computed by the caller for the standard path, so the
 * detector costs no extra median).
 */
export function isSoftAlphaArt(
  raw: Uint8ClampedArray,
  width: number,
  height: number,
  denoised: Uint8ClampedArray
): boolean {
  if (partialAlphaFraction(raw, width, height) < SOFT_ALPHA_MIN_PARTIAL_FRACTION) {
    return false;
  }
  return (
    noiseFraction(raw, denoised, width, height) >=
    SOFT_ALPHA_MIN_REWRITE_FRACTION
  );
}

/**
 * Soft-alpha-art branch of the decode pipeline: returns the raw decoded
 * pixels when soft anti-aliased artwork is detected (the caller then
 * skips the median denoise and the edge restore), otherwise null (the
 * caller falls back to the standard denoise path).
 */
export function softAlphaPassthrough(
  raw: Uint8ClampedArray,
  width: number,
  height: number,
  denoised: Uint8ClampedArray
): Uint8ClampedArray | null {
  if (isSoftAlphaArt(raw, width, height, denoised)) {
    return raw;
  }
  return null;
}
