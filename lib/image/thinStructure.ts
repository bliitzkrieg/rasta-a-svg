/**
 * Thin-structure detection and passthrough for decoded source pixels.
 *
 * The 5x5 median denoise erases 1px-thin high-contrast structures: a thin
 * line is a minority of the 25px window, so the median replaces it with
 * the background. On images whose content IS thin lines (line art,
 * wireframes, thin line plots), that smoothing is irreversible damage the
 * end-to-end fidelity metric measures directly (parity harness, honest
 * metric: line_art 0.7999 and thin_lines 0.7913 with the median in the
 * path, 1.0000 for both without it).
 *
 * The passthrough is gated so it never touches other content: it fires
 * only when the decoded image has very few distinct RGB colors (at most
 * 8, so the changed pixels cannot be photographic texture) AND the median
 * would rewrite a significant share of pixels (at least 5% change by more
 * than 8 in some channel). Flat icons and logos have few colors but the
 * median barely touches them; photos change a lot under the median but
 * have thousands of colors. Parity harness: the gate fires only on
 * thin_lines and line_art across the 14-image suite.
 */

import { noiseFraction } from "./unsharpMask";

const THIN_STRUCTURE_MAX_COLORS = 8;
const THIN_STRUCTURE_MIN_CHANGE_FRACTION = 0.05;

/** Number of distinct RGB triples in the decoded pixels (alpha ignored). */
export function countUniqueRgb(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): number {
  const seen = new Set<number>();
  const n = Math.min(pixels.length, width * height * 4);
  for (let i = 0; i + 3 < n; i += 4) {
    seen.add(pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2]);
  }
  return seen.size;
}

/**
 * True when the image holds thin high-contrast structures the 5x5 median
 * would erase: few distinct colors, but the median rewrites many pixels.
 * `denoised` must be the 5x5 median of `raw` (already computed by the
 * caller for the standard path, so the detector costs no extra median).
 */
export function isThinStructure(
  raw: Uint8ClampedArray,
  width: number,
  height: number,
  denoised: Uint8ClampedArray
): boolean {
  if (countUniqueRgb(raw, width, height) > THIN_STRUCTURE_MAX_COLORS) {
    return false;
  }
  return (
    noiseFraction(raw, denoised, width, height) >=
    THIN_STRUCTURE_MIN_CHANGE_FRACTION
  );
}

/**
 * Thin-structure branch of the decode pipeline: returns the raw decoded
 * pixels when thin structures are detected (the caller then skips the
 * median denoise and the edge restore), otherwise null (the caller falls
 * back to the standard denoise path).
 */
export function thinStructurePassthrough(
  raw: Uint8ClampedArray,
  width: number,
  height: number,
  denoised: Uint8ClampedArray
): Uint8ClampedArray | null {
  if (isThinStructure(raw, width, height, denoised)) {
    return raw;
  }
  return null;
}
