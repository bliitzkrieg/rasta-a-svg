import { decode } from "fast-png";
import { preprocessImageData } from "./preprocess";

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
    // Resize needed: use canvas path (drawImage does the scaling)
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
    raw = ctx.getImageData(0, 0, outputWidth, outputHeight).data;
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
