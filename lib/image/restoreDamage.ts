/**
 * Edge-restore damage detection and passthrough for decoded source pixels.
 *
 * The adaptive unsharp-mask edge restore sharpens the 5x5 median output to
 * recover edge crispness the median rounded. On flat artwork that
 * sharpening has nothing to fix: the median is edge-preserving on hard
 * edges, so the mask only adds overshoot halos around every boundary,
 * pushing already-correct pixels past the scoring tolerance. The
 * 64-level posterize then quantizes the halos into bands, compounding the
 * damage. The tracer reproduces the median-only pixels faithfully, so the
 * full ceiling gap is recoverable by skipping the restore while keeping
 * the median (parity harness, honest end-to-end metric, prep ceilings:
 * luca_frog 0.9595 to 0.9825, luca_sunglasses 0.9691 to 0.9877,
 * luca_bathtub 0.9734 to 0.9907, goose_balloon 0.9898 to 0.9938,
 * text_logo 0.9927 to 0.9948).
 *
 * The gate is deliberately narrow so it never touches other content. It
 * fires only when BOTH hold:
 * - the image is flat art: a palette-snap tier fires on the
 *   median-denoised pixels (the tracer reproduces such content
 *   faithfully, so the restore's sharpening buys nothing). Reuses
 *   paletteSnapTier, the battle-tested flat-art test.
 * - the restore would actually run: the median rewrote at least 0.05% of
 *   pixels by more than 8 in some channel (noiseFraction >= NOISE_GATE,
 *   the same condition adaptiveEdgeRestore uses to apply the mask).
 *   Images below that threshold keep the standard path; the restore is a
 *   no-op for them anyway.
 * Parity harness: the gate fires only on goose_balloon.png,
 * luca_bathtub.png, luca_frog.png, luca_sunglasses.png, and
 * text_logo.png across the 18-image suite. The already-gated images
 * (dither, thin-structure, noisy-photo, soft-alpha, median-damage)
 * return before this gate is evaluated, so their behavior is unchanged.
 */

import { noiseFraction, NOISE_GATE } from "./unsharpMask";
import { paletteSnapTier } from "./paletteSnap";

/**
 * True when the unsharp edge restore would damage flat artwork more than
 * it helps: flat art (a palette tier fires on the median-denoised pixels)
 * where the restore would actually apply. `denoised` must be the 5x5
 * median of `raw` (already computed by the caller for the standard path,
 * so the detector costs no extra median).
 */
export function isRestoreDamaging(
  raw: Uint8ClampedArray,
  denoised: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  if (paletteSnapTier(denoised) === null) {
    return false;
  }
  return noiseFraction(raw, denoised, width, height) >= NOISE_GATE;
}

/**
 * Edge-restore branch of the decode pipeline: returns the median-denoised
 * pixels when the restore would damage flat-art edges (the caller then
 * skips the unsharp mask but keeps the median), otherwise null (the
 * caller falls back to the standard adaptive edge restore).
 */
export function restoreDamagePassthrough(
  raw: Uint8ClampedArray,
  denoised: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray | null {
  if (isRestoreDamaging(raw, denoised, width, height)) {
    return denoised;
  }
  return null;
}
