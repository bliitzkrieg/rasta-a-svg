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
  const buffer = await blob.arrayBuffer();
  return decodeBufferToImageData(buffer);
}

/**
 * Full decode pipeline from an ArrayBuffer: fast-png (or the browser
 * fallback), JS box downscale, then preprocessing. Runs on the main thread
 * or in a worker; the vectorization worker calls this so large images never
 * block the tab.
 */
export async function decodeBufferToImageData(
  buffer: ArrayBuffer,
): Promise<DecodedImage> {
  // Decode with fast-png (handles all PNG types via toRgba8), then downscale
  // in JS with area-weighted averaging. This avoids canvas premultiplication
  // precision loss, the iOS Safari 16.7MP canvas limit, and browser-to-browser
  // canvas smoothing differences.
  // Note: fast-png ignores embedded color profiles (iCCP/gAMA) that browsers
  // apply when displaying PNGs. Rare, but profiled PNGs may differ slightly.
  const { width, height, pixels: fullPixels } = await decodeImageBuffer(buffer);

  const maxSide = Math.max(width, height);
  const scale = maxSide > TARGET_MAX_DIMENSION ? TARGET_MAX_DIMENSION / maxSide : 1;
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));

  let raw: Uint8ClampedArray;
  if (scale === 1) {
    raw = fullPixels;
  } else {
    raw = boxDownscale(
      fullPixels,
      width,
      height,
      outputWidth,
      outputHeight,
    );
  }

  const prepped = preprocessImageData(raw, outputWidth, outputHeight);
  return {
    width: outputWidth,
    height: outputHeight,
    sourceWidth: width,
    sourceHeight: height,
    pixels: prepped.pixels,
    paletteTier: prepped.paletteTier,
    originalPixels: prepped.originalPixels,
  };
}

/**
 * Decode an image buffer to 8-bit RGBA. Tries fast-png first; on failure
 * (e.g. RGB with tRNS, or a JPEG mislabeled as .png) falls back to the
 * browser decoder via createImageBitmap. Works on the main thread and in
 * workers (uses OffscreenCanvas when available).
 */
export async function decodeImageBuffer(
  buffer: ArrayBuffer,
): Promise<{ width: number; height: number; pixels: Uint8ClampedArray }> {
  try {
    const png = decode(buffer);
    return { width: png.width, height: png.height, pixels: toRgba8(png) };
  } catch {
    return decodeWithBrowser(new Blob([buffer]));
  }
}

async function decodeWithBrowser(
  blob: Blob,
): Promise<{ width: number; height: number; pixels: Uint8ClampedArray }> {
  // This path is only reached when fast-png throws, so this error means the
  // file is both unparseable by fast-png and undeodable by the browser.
  if (typeof createImageBitmap === "undefined") {
    throw new Error(
      "Could not decode this image: fast-png failed and the browser image decoder is unavailable.",
    );
  }
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none" });
  const useOffscreen = typeof OffscreenCanvas !== "undefined";
  const canvas = useOffscreen
    ? new OffscreenCanvas(bitmap.width, bitmap.height)
    : document.createElement("canvas");
  // Plain HTMLCanvasElement needs explicit sizing; OffscreenCanvas takes it
  // in the constructor. (Compare against the branch above, not
  // `instanceof OffscreenCanvas`, which throws when the global is missing.)
  if (!useOffscreen) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) {
    throw new Error("Failed to create canvas context for image decode.");
  }
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close?.();
  return {
    width: bitmap.width,
    height: bitmap.height,
    pixels: imageData.data,
  };
}
