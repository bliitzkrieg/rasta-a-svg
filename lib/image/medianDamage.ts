/**
 * Median-damage detection and passthrough for decoded source pixels.
 *
 * The 5x5 median denoise smears thin high-contrast structures (1-2px
 * bar-chart borders, halftone dots, small text edges) on flat artwork,
 * and the adaptive edge restore cannot recover what the median erased:
 * unsharp masking sharpens the smeared remnant but never rebuilds the
 * original line. On such images the prepped pixels the tracer sees
 * already score well below the original (parity harness, honest
 * end-to-end metric: chart 0.9513 prep ceiling vs 0.9515 traced), so the
 * tracer is blameless and all the loss is preprocessing. Skipping the
 * median and the edge restore hands the tracer the raw structures it
 * reproduces faithfully (chart 0.9515 to 0.9909, halftone 0.9807 to
 * 0.9995, diagonal_text 0.9666 to 0.9725).
 *
 * The gate is deliberately narrow so it never touches other content. It
 * fires only when BOTH hold:
 * - the image is flat art: a palette-snap tier fires on the raw,
 *   pre-median pixels (the tracer reproduces such content faithfully,
 *   so the median's smoothing buys nothing). Reuses paletteSnapTier,
 *   the battle-tested flat-art test.
 * - the median is doing real damage: it would rewrite at least 1.5% of
 *   pixels by more than 8 in some channel (noiseFraction). Flat images
 *   the median merely nudges (text_logo 0.16%, icons 0.03%) keep the
 *   standard path; on text_logo the median is even slightly beneficial
 *   (0.9897 vs 0.9890 without it), so the threshold must clear it.
 * Parity harness: the gate fires only on chart.png, halftone.png, and
 * diagonal_text.png across the 18-image suite (rewrite 1.70%-3.36%;
 * closest non-firer goose_balloon 0.91%). The already-gated images
 * (dither, thin-structure, noisy-photo, soft-alpha) return raw before
 * this gate is evaluated, so their behavior is unchanged.
 */

import { noiseFraction } from "./unsharpMask";
import { paletteSnapTier } from "./paletteSnap";

const MEDIAN_DAMAGE_MIN_REWRITE_FRACTION = 0.015;

/**
 * True when the 5x5 median would damage flat artwork more than the edge
 * restore can recover: flat art (a palette tier fires on the raw pixels)
 * with the median rewriting a significant share of pixels. `denoised`
 * must be the 5x5 median of `raw` (already computed by the caller for
 * the standard path, so the detector costs no extra median).
 */
export function isMedianDamaging(
  raw: Uint8ClampedArray,
  width: number,
  height: number,
  denoised: Uint8ClampedArray
): boolean {
  if (paletteSnapTier(raw) === null) {
    return false;
  }
  return (
    noiseFraction(raw, denoised, width, height) >=
    MEDIAN_DAMAGE_MIN_REWRITE_FRACTION
  );
}

/**
 * Median-damage branch of the decode pipeline: returns the raw decoded
 * pixels when the median would damage flat-art structures (the caller
 * then skips the median denoise and the edge restore), otherwise null
 * (the caller falls back to the standard denoise path).
 */
export function medianDamagePassthrough(
  raw: Uint8ClampedArray,
  width: number,
  height: number,
  denoised: Uint8ClampedArray
): Uint8ClampedArray | null {
  if (isMedianDamaging(raw, width, height, denoised)) {
    return raw;
  }
  return null;
}
