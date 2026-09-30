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
 * fires only when the image is flat art (a palette-snap tier fires on
 * the raw, pre-median pixels: the tracer reproduces such content
 * faithfully, so the median's smoothing buys nothing) AND the median is
 * doing real damage (it would rewrite a significant share of pixels by
 * more than 8 in some channel, noiseFraction). Two bands:
 * - legacy band (rewrite >= 1.5%): proven wins on chart, halftone, and
 *   diagonal_text; behavior preserved exactly.
 * - extended band (rewrite >= 0.3%): color path only, i.e. the
 *   damage-checked tier does NOT fire on the median-denoised pixels
 *   (the pipeline's actual binary/color decision is made on prepped
 *   pixels, and raw pixels mis-predict goose_balloon as color-path).
 *   The binary path is excluded because the median's denoising gives it
 *   a cleaner palette snap (the recolor recovers fills from the
 *   originals), and skipping it there is a measured regression
 *   (goose_balloon 0.9980 to 0.9869). On the color path the median only
 *   smears thin structures the clustering cannot recover.
 * Parity harness: the gate fires on chart.png, halftone.png, and
 * diagonal_text.png (legacy band) plus luca_frog.png,
 * luca_sunglasses.png, and luca_bathtub.png (extended band) across the
 * 18-image suite. The already-gated images (dither, thin-structure,
 * noisy-photo, soft-alpha) return raw before this gate is evaluated, so
 * their behavior is unchanged.
 */

import { noiseFraction } from "./unsharpMask";
import {
  damageCheckedPaletteSnapTier,
  paletteSnapTier,
} from "./paletteSnap";

const MEDIAN_DAMAGE_MIN_REWRITE_FRACTION = 0.015;
// Lower rewrite bar for the extended band below: on the color path the
// median's smearing of thin structures is pure damage (there is no
// palette snap for it to clean), so less rewriting still justifies
// skipping it.
const MEDIAN_DAMAGE_COLOR_PATH_MIN_REWRITE_FRACTION = 0.003;

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
  const rewrite = noiseFraction(raw, denoised, width, height);
  // Legacy band: flat art the median heavily rewrites. Proven wins on
  // chart, halftone, and diagonal_text; behavior preserved exactly.
  if (rewrite >= MEDIAN_DAMAGE_MIN_REWRITE_FRACTION) {
    return true;
  }
  // Extended band: on the color path the median's smearing of thin
  // structures is pure damage (no palette snap to clean), so the lower
  // rewrite bar applies. The binary path is excluded: there the median's
  // denoising gives a cleaner palette snap (fills recovered from the
  // originals by the recolor), and skipping it is a measured regression
  // (goose_balloon 0.9980 to 0.9869). The damage-checked tier is
  // evaluated on the denoised pixels, the closest predictor of the
  // pipeline's actual binary/color decision (raw pixels mis-predict
  // goose as color-path). Proven: luca_frog, luca_sunglasses, and
  // luca_bathtub each score a perfect 1.0 without the median.
  return (
    rewrite >= MEDIAN_DAMAGE_COLOR_PATH_MIN_REWRITE_FRACTION &&
    damageCheckedPaletteSnapTier(denoised, width, height) === null
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
