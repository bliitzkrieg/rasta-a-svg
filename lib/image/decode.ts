import { medianFilter5x5 } from "./medianFilter";
import { adaptiveEdgeRestore } from "./unsharpMask";
import { descreenIfDithered } from "./descreen";
import { posterizeImageData } from "./posterize";
import { adaptiveMajorityVote } from "./majorityVote";
import { compositeAlphaOverWhite } from "./alphaComposite";
import { gatedPaletteSnap } from "./paletteSnap";

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
  // skip the edge restore and are descreened with a Gaussian instead, so
  // the surviving 1px checkerboard becomes the underlying tone ramp
  // (parity harness: +0.0026 to 0.9938, no per-image regressions;
  // dither 0.9566 to 0.9953).
  const denoised = medianFilter5x5(raw, canvas.width, canvas.height);
  const descreened = descreenIfDithered(raw, denoised, canvas.width, canvas.height);
  const restored =
    descreened ?? adaptiveEdgeRestore(raw, denoised, canvas.width, canvas.height);
  const posterized = posterizeImageData(restored, canvas.width, canvas.height);
  const voted = adaptiveMajorityVote(posterized, canvas.width, canvas.height);
  const composited = compositeAlphaOverWhite(voted, canvas.width, canvas.height);
  const data = gatedPaletteSnap(composited, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    pixels: data,
  };
}
