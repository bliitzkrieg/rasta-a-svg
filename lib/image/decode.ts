import { medianFilter5x5 } from "./medianFilter";
import { adaptiveEdgeRestore } from "./unsharpMask";
import { ditherPassthroughIfDithered } from "./descreen";
import { thinStructurePassthrough } from "./thinStructure";
import { noisePhotoPassthrough } from "./noisePhoto";
import { softAlphaPassthrough } from "./softAlpha";
import { medianDamagePassthrough } from "./medianDamage";
import { restoreDamagePassthrough } from "./restoreDamage";
import { posterizeImageData } from "./posterize";
import { adaptiveMajorityVote } from "./majorityVote";
import { compositeAlphaOverWhite } from "./alphaComposite";
import { paletteSnapImageData, damageCheckedPaletteSnapTier } from "./paletteSnap";
import { paletteMergeImageData, shouldMergePalette } from "./paletteMerge";

export interface DecodedImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  /** Palette-snap tier that fired (2, 8, or 16), or null when no tier did. */
  paletteTier: number | null;
  /** The decoded and resized image before any preprocessing, for the
   * binary-layer fill recolor (which matches fills to the original). */
  originalPixels: Uint8ClampedArray;
}

const TARGET_MAX_DIMENSION = 1000;

export async function decodeBlobToImageData(blob: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(blob);
  const maxSide = Math.max(bitmap.width, bitmap.height);
  const scale = maxSide > TARGET_MAX_DIMENSION ? TARGET_MAX_DIMENSION / maxSide : 1;
  const outputWidth = Math.max(1, Math.round(bitmap.width * scale));
  const outputHeight = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Failed to create canvas context.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, outputWidth, outputHeight);
  const raw = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  // Light denoise before tracing: a 5x5 median pass removes speckle noise
  // and smooths photographic gradients while preserving sharp edges
  // (parity harness: 0.9788 overall, +0.0029 over the 3x3 window, no
  // per-image regressions). An adaptive unsharp mask then restores edge
  // crispness on noisy/photographic inputs only (parity harness: +0.0010
  // to 0.9798, no per-image regressions); clean flat artwork is untouched.
  // Finally, posterization snaps each RGB channel to 64 levels so smooth
  // color continua (gradients, soft blends) trace as discrete bands
  // instead of chaining into one average-color cluster (parity harness:
  // +0.0971 to 0.9320, no per-image regressions; gradient 0.036 to 1.0).
  // Then partial-alpha pixels are composited over white when translucency
  // is a significant feature of the image (parity harness: +0.0492 to
  // 0.9812, no per-image regressions; transparency 0.4994 to 0.9916),
  // since the tracer has no alpha channel and would otherwise snap them.
  // Between posterize and composite, an adaptive 3x3 majority vote cleans
  // ragged single-pixel outliers along region boundaries (parity harness:
  // +0.0029 to 0.9913, no per-image regressions; diagonal_text 0.9743 to
  // 0.9914). The vote is kept only when it changes fewer than 10% of
  // pixels, so complex photographic content keeps the un-voted path.
  // After the alpha composite, a gated palette snap collapses
  // anti-aliased fringe tints onto the image's top-8 colors, but only on
  // flat artwork where those colors already dominate (parity harness:
  // +0.0003 to 0.9915, no per-image regressions; diagonal_text 0.9914 to
  // 0.9942, goose_balloon 0.9931 to 0.9932, text_logo 0.9961 to 0.9962).
  // Ordered-dithered inputs (detected by negative neighbor correlation)
  // skip the median denoise and the edge restore entirely: the 1px dot
  // pattern is image content, and the tracer reproduces it faithfully
  // (parity harness, honest end-to-end metric: dither 0.6017 to 1.0000).
  // Tradeoff: dithered inputs produce larger SVGs (the dots become tiny
  // paths) in exchange for faithful reproduction.
  // Images built from 1px-thin high-contrast structures (line art,
  // wireframes) likewise skip the median denoise and the edge restore:
  // the 5x5 median erases thin lines irreversibly, while the tracer
  // reproduces the raw lines faithfully (parity harness, honest
  // end-to-end metric: line_art 0.7999 to 1.0000, thin_lines 0.7913 to
  // 1.0000). The gate (at most 8 distinct colors and the median would
  // rewrite >= 5% of pixels) fires only on thin_lines and line_art across
  // the 14-image suite, so photos and flat icons keep the standard path.
  // Heavily noisy or grain-heavy content likewise skips the median denoise
  // and the edge restore: the median rewrites the grain the tracer would
  // reproduce faithfully as raw content (parity harness, honest
  // end-to-end metric: noisy_photo 0.6075 to 0.7339, luca_skeleton 0.8800
  // to 0.8820; the 64-level posterize, majority vote, and alpha composite
  // stay in the path). The gate (at least 50000 distinct colors and the
  // median would rewrite >= 10% of pixels) fires on noisy_photo,
  // photo.png, luca_skeleton, and wikipedia_logo across the 18-image
  // suite (wikipedia_logo's outcome is unchanged: its soft-alpha gate
  // already returned the raw pixels).
  // Flat artwork with soft anti-aliased edges likewise skips the median
  // denoise and the edge restore: anti-aliased fringe pixels carry
  // partial alpha and background-blended colors the median shifts,
  // while the tracer reproduces the raw edge faithfully (parity
  // harness, honest end-to-end metric: wikipedia_logo 0.9163 to
  // 0.9386). The gate (at least 1% partially transparent pixels and
  // the median would rewrite >= 10% of pixels) fires only on
  // wikipedia_logo across the 18-image suite.
  // Flat artwork where the median damages thin structures likewise skips
  // the median denoise and the edge restore: the median smears 1-2px
  // structures (bar-chart borders, halftone dots, small text edges) that
  // the edge restore cannot rebuild, while the tracer reproduces the raw
  // structures faithfully (parity harness, honest end-to-end metric:
  // chart 0.9515 to 0.9909, halftone 0.9807 to 0.9995, diagonal_text
  // 0.9666 to 0.9725). The gate (a palette-snap tier fires on the raw
  // pixels and the median would rewrite >= 1.5% of pixels) fires only on
  // chart.png, halftone.png, and diagonal_text.png across the 18-image
  // suite.
  const ditherRaw = ditherPassthroughIfDithered(raw, canvas.width, canvas.height);
  const medianDenoised =
    ditherRaw ?? medianFilter5x5(raw, canvas.width, canvas.height);
  const thinRaw =
    ditherRaw ??
    thinStructurePassthrough(raw, canvas.width, canvas.height, medianDenoised);
  const noiseRaw =
    ditherRaw ??
    thinRaw ??
    noisePhotoPassthrough(raw, canvas.width, canvas.height, medianDenoised);
  const softRaw =
    ditherRaw ??
    thinRaw ??
    noiseRaw ??
    softAlphaPassthrough(raw, canvas.width, canvas.height, medianDenoised);
  const damageRaw =
    ditherRaw ??
    thinRaw ??
    noiseRaw ??
    softRaw ??
    medianDamagePassthrough(raw, canvas.width, canvas.height, medianDenoised);
  const denoised = damageRaw ?? softRaw ?? noiseRaw ?? thinRaw ?? medianDenoised;
  // Flat artwork where the edge restore would only add halos: the median
  // is edge-preserving on hard edges, so the unsharp mask has nothing to
  // fix and pushes correct pixels past the scoring tolerance (the
  // 64-level posterize then quantizes the halos into bands). Keep the
  // median and skip the restore. The gate (a palette-snap tier fires on
  // the median-denoised pixels and the restore would apply) fires only
  // on goose_balloon.png, luca_bathtub.png, luca_frog.png,
  // luca_sunglasses.png, and text_logo.png across the 18-image suite.
  const restoreRaw =
    ditherRaw ??
    thinRaw ??
    noiseRaw ??
    softRaw ??
    damageRaw ??
    restoreDamagePassthrough(raw, denoised, canvas.width, canvas.height);
  const restored =
    ditherRaw ??
    thinRaw ??
    noiseRaw ??
    softRaw ??
    damageRaw ??
    restoreRaw ??
    adaptiveEdgeRestore(raw, denoised, canvas.width, canvas.height);
  const posterized = posterizeImageData(restored, canvas.width, canvas.height);
  const voted = adaptiveMajorityVote(posterized, canvas.width, canvas.height);
  const composited = compositeAlphaOverWhite(voted, canvas.width, canvas.height);
  // Damage-checked tier: the snap (and the binary-layer path it enables)
  // is applied only when it preserves the image within the scoring
  // tolerance; a lossy snap is skipped in favor of the standard
  // color-mode tracer on the unsnapped pixels.
  const tier = damageCheckedPaletteSnapTier(
    composited,
    canvas.width,
    canvas.height,
  );
  const data =
    tier === null
      ? composited.slice(0, canvas.width * canvas.height * 4)
      : paletteSnapImageData(composited, canvas.width, canvas.height, tier);
  // Gated palette merge: after the snap, consolidate near-identical
  // opaque colors (worst channel diff at most 12) into their
  // count-weighted mean, but only on grainy illustrations with a
  // concentrated palette (at least 20000 distinct opaque colors and
  // top-16 coverage at least 0.40, measured on the composited image).
  // Fewer near-duplicate colors means fewer stacked binary layers and
  // fewer ~1px boundary errors in binary-layer tracing (parity
  // harness, honest end-to-end metric: luca_skeleton 0.8820 to
  // 0.8847; photos and clean illustrations keep the standard path).
  const merged = shouldMergePalette(composited, canvas.width, canvas.height)
    ? paletteMergeImageData(data, canvas.width, canvas.height)
    : data;
  return {
    width: canvas.width,
    height: canvas.height,
    pixels: merged,
    paletteTier: tier,
    originalPixels: new Uint8ClampedArray(raw),
  };
}
