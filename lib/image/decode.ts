import { decode } from "fast-png";
import { preprocessImageData } from "./preprocess";
import { boxDownscale } from "./downscale";

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
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none" });
  const maxSide = Math.max(bitmap.width, bitmap.height);
  const scale = maxSide > TARGET_MAX_DIMENSION ? TARGET_MAX_DIMENSION / maxSide : 1;
  const outputWidth = Math.max(1, Math.round(bitmap.width * scale));
  const outputHeight = Math.max(1, Math.round(bitmap.height * scale));

  let raw: Uint8ClampedArray;
  let canvasWidth: number;
  let canvasHeight: number;

  if (scale === 1) {
    // No resize needed: decode PNG directly to avoid canvas premultiplication
    // precision loss (Claude feedback item 6). The canvas path stores
    // premultiplied pixels and un-premultiplies on getImageData, losing
    // precision for low-alpha pixels.
    const buffer = await blob.arrayBuffer();
    const png = decode(buffer);
    canvasWidth = png.width;
    canvasHeight = png.height;
    // fast-png returns RGBA as Uint8Array; convert to Uint8ClampedArray
    raw = new Uint8ClampedArray(png.data);
  } else {
    // Resize needed: decode with fast-png, then downscale in JS with
    // area-weighted averaging. This matches the parity benchmark byte for
    // byte, avoids canvas premultiplication loss, and is consistent across
    // browsers (canvas smoothing differs between Chrome/Firefox/Safari).
    // Note: fast-png only handles PNG; for other formats we still need
    // createImageBitmap. The bitmap was already created above, so draw it
    // to a canvas at full size first, then downscale the pixels in JS.
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = bitmap.width;
    fullCanvas.height = bitmap.height;
    const fullCtx = fullCanvas.getContext("2d", { willReadFrequently: true });
    if (!fullCtx) {
      throw new Error("Failed to create canvas context.");
    }
    fullCtx.drawImage(bitmap, 0, 0);
    const fullPixels = fullCtx.getImageData(
      0,
      0,
      bitmap.width,
      bitmap.height,
    ).data;
    raw = boxDownscale(
      fullPixels,
      bitmap.width,
      bitmap.height,
      outputWidth,
      outputHeight,
    );
    canvasWidth = outputWidth;
    canvasHeight = outputHeight;
  }
  const prepped = preprocessImageData(raw, canvasWidth, canvasHeight);
  return {
    width: canvasWidth,
    height: canvasHeight,
    sourceWidth: bitmap.width,
    sourceHeight: bitmap.height,
    pixels: prepped.pixels,
    paletteTier: prepped.paletteTier,
    originalPixels: prepped.originalPixels,
  };
}
