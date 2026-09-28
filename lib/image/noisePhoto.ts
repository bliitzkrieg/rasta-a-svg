/**
 * Noisy-photo detection and passthrough for decoded source pixels.
 *
 * A 5x5 median denoise is destructive on heavily noisy photographic
 * inputs: with most pixels carrying sensor noise or compression grain,
 * the median rewrites the majority of the image and the honest
 * end-to-end parity metric measures that damage directly (parity
 * harness: noisy_photo 0.6075 with the median in the path, 0.7339 with
 * the median and the edge restore skipped; the 64-level posterize,
 * majority vote, and alpha composite stay in the path). The tracer
 * reproduces the raw noise faithfully, so the noise is treated as
 * image content, the same tradeoff the ordered-dither passthrough
 * accepted: faithful reproduction at a larger SVG size.
 *
 * The gate is conservative and fires only on noisy photos: the image
 * must hold many distinct RGB colors (at least 50000, so flat art and
 * thin line work are excluded) AND the median must rewrite at least a
 * quarter of all pixels by more than 8 in some channel. Parity harness:
 * the gate fires only on noisy_photo and photo.png across the 18-image
 * suite (noisy_photo rewrites 0.6976 of pixels, photo.png 0.2965; the
 * next closest, wikipedia_logo, rewrites 0.1500 and keeps the standard
 * path).
 */

import { noiseFraction } from "./unsharpMask";
import { countUniqueRgb } from "./thinStructure";

const NOISY_PHOTO_MIN_COLORS = 50000;
const NOISY_PHOTO_MIN_REWRITE_FRACTION = 0.25;

/**
 * True when the image is a noisy photograph the 5x5 median would
 * damage: many distinct colors (photographic content) and the median
 * rewrites at least a quarter of all pixels. `denoised` must be the 5x5
 * median of `raw` (already computed by the caller for the standard
 * path, so the detector costs no extra median).
 */
export function isNoisyPhoto(
  raw: Uint8ClampedArray,
  width: number,
  height: number,
  denoised: Uint8ClampedArray
): boolean {
  if (countUniqueRgb(raw, width, height) < NOISY_PHOTO_MIN_COLORS) {
    return false;
  }
  return (
    noiseFraction(raw, denoised, width, height) >=
    NOISY_PHOTO_MIN_REWRITE_FRACTION
  );
}

/**
 * Noise-photo branch of the decode pipeline: returns the raw decoded
 * pixels when a noisy photo is detected (the caller then skips the
 * median denoise and the edge restore), otherwise null (the caller
 * falls back to the standard denoise path).
 */
export function noisePhotoPassthrough(
  raw: Uint8ClampedArray,
  width: number,
  height: number,
  denoised: Uint8ClampedArray
): Uint8ClampedArray | null {
  if (isNoisyPhoto(raw, width, height, denoised)) {
    return raw;
  }
  return null;
}
