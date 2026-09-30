/**
 * Pure image preprocessing pipeline (no browser APIs).
 *
 * This is the preprocessing that runs after decoding and resizing,
 * extracted from decode.ts so the Node.js pixel benchmark can run the
 * real pipeline without a browser.
 */
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

export interface PreprocessedImage {
  pixels: Uint8ClampedArray;
  paletteTier: number | null;
  originalPixels: Uint8ClampedArray;
}

/**
 * Run the full preprocessing pipeline on raw RGBA pixels.
 * Returns the prepped pixels, the palette tier that fired (if any),
 * and a copy of the raw input as originalPixels.
 */
export function preprocessImageData(
  raw: Uint8ClampedArray,
  width: number,
  height: number,
): PreprocessedImage {
  const ditherRaw = ditherPassthroughIfDithered(raw, width, height);
  const medianDenoised =
    ditherRaw ?? medianFilter5x5(raw, width, height);
  const thinRaw =
    ditherRaw ??
    thinStructurePassthrough(raw, width, height, medianDenoised);
  const noiseRaw =
    ditherRaw ??
    thinRaw ??
    noisePhotoPassthrough(raw, width, height, medianDenoised);
  const softRaw =
    ditherRaw ??
    thinRaw ??
    noiseRaw ??
    softAlphaPassthrough(raw, width, height, medianDenoised);
  const damageRaw =
    ditherRaw ??
    thinRaw ??
    noiseRaw ??
    softRaw ??
    medianDamagePassthrough(raw, width, height, medianDenoised);
  const denoised = damageRaw ?? softRaw ?? noiseRaw ?? thinRaw ?? medianDenoised;
  const restoreRaw =
    ditherRaw ??
    thinRaw ??
    noiseRaw ??
    softRaw ??
    damageRaw ??
    restoreDamagePassthrough(raw, denoised, width, height);
  const restored =
    ditherRaw ??
    thinRaw ??
    noiseRaw ??
    softRaw ??
    damageRaw ??
    restoreRaw ??
    adaptiveEdgeRestore(raw, denoised, width, height);
  const posterized = posterizeImageData(restored, width, height);
  const voted = adaptiveMajorityVote(posterized, width, height);
  const composited = compositeAlphaOverWhite(voted, width, height);
  const tier = damageCheckedPaletteSnapTier(
    composited,
    width,
    height,
  );
  const data =
    tier === null
      ? composited.slice(0, width * height * 4)
      : paletteSnapImageData(composited, width, height, tier);
  const merged = shouldMergePalette(composited, width, height)
    ? paletteMergeImageData(data, width, height)
    : data;
  return {
    pixels: merged,
    paletteTier: tier,
    originalPixels: new Uint8ClampedArray(raw),
  };
}
