import { decode } from "fast-png";
import { preprocessImageData } from "./preprocess";
import { boxDownscale } from "./downscale";
import { toRgba8 } from "./toRgba8";

export interface DecodedImage {
  width: number;
  height: number;
  /** Original source dimensions before downscaling (for SVG display size). */
  sourceWidth: number;
  sourceHeight: number;
  pixels: Uint8ClampedArray;
  /** Palette-snap tier that fired (n for tier 1, 16, or 32), or null when no tier did. */
  paletteTier: number | null;
  /** The decoded and resized image before any preprocessing, for the
   * binary-layer fill recolor (which matches fills to the original). */
  originalPixels: Uint8ClampedArray;
}

const TARGET_MAX_DIMENSION = 1000;

export async function decodeBlobToImageData(blob: Blob): Promise<DecodedImage> {
  // Decode PNG with fast-png (handles all PNG types via toRgba8), then
  // downscale in JS with area-weighted averaging. This avoids canvas
  // entirely: no premultiplication precision loss, no iOS Safari 16.7MP
  // canvas limit, no 3x memory spike on the main thread, and identical
  // results across browsers (canvas smoothing differs by browser).
  // Note: fast-png ignores embedded color profiles (iCCP/gAMA) that browsers
  // apply when displaying PNGs. Rare, but profiled PNGs may differ slightly.
  const buffer = await blob.arrayBuffer();
  const png = decode(buffer);
  const fullPixels = toRgba8(png);

  const maxSide = Math.max(png.width, png.height);
  const scale = maxSide > TARGET_MAX_DIMENSION ? TARGET_MAX_DIMENSION / maxSide : 1;
  const outputWidth = Math.max(1, Math.round(png.width * scale));
  const outputHeight = Math.max(1, Math.round(png.height * scale));

  let raw: Uint8ClampedArray;
  if (scale === 1) {
    raw = fullPixels;
  } else {
    raw = boxDownscale(
      fullPixels,
      png.width,
      png.height,
      outputWidth,
      outputHeight,
    );
  }

  const prepped = preprocessImageData(raw, outputWidth, outputHeight);
  return {
    width: outputWidth,
    height: outputHeight,
    sourceWidth: png.width,
    sourceHeight: png.height,
    pixels: prepped.pixels,
    paletteTier: prepped.paletteTier,
    originalPixels: prepped.originalPixels,
  };
}
