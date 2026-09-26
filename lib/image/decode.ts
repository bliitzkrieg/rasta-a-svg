import { medianFilter3x3 } from "./medianFilter";

export interface DecodedImage {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
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
  // Light denoise before tracing: a 3x3 median pass removes speckle noise
  // while preserving sharp edges (parity harness: +0.0066 overall, no
  // per-image regressions).
  const data = medianFilter3x3(raw, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    pixels: data,
  };
}
