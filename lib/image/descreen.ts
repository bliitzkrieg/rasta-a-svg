/**
 * Ordered-dither detection and descreening for decoded source pixels.
 *
 * A 5x5 median pass does not remove ordered (Bayer-matrix) dithering: the
 * regular 1px checkerboard survives, and the tracer then misclassifies the
 * dithered zone as a solid region of the majority color (parity harness:
 * dither 0.9566, with 97% of errors a pink dither zone rendered as black).
 * A Gaussian blur after the median smooths the checkerboard into the
 * underlying tone ramp, which the tracer reproduces with flat bands
 * (parity harness: dither 0.9566 to 0.9953, no per-image regressions).
 *
 * The blur is gated by ordered-dither detection so it never touches
 * non-dithered images: Bayer dither alternates every pixel, giving a
 * negative mean horizontal neighbor correlation, while all natural and
 * flat-art images have positive correlation (parity harness: dither
 * -0.34, the lowest non-dithered image +0.16). When dither is detected
 * the unsharp edge restore is skipped as well, since it would re-enhance
 * the checkerboard the blur just removed.
 *
 * The Gaussian mirrors lib/image/unsharpMask.ts (same kernel
 * construction, separable passes, edge replication, bankers rounding);
 * the parity harness cross-checks it byte-identical.
 */

const DESCREEN_SIGMA = 2.5;
// Ordered dither gives strongly negative correlation (about -0.3);
// pure noise sits near 0, so -0.1 keeps a wide margin against false
// positives on noisy inputs while catching real dither.
const DITHER_CORR_THRESHOLD = -0.1;

function gaussianKernel(sigma: number): Float64Array {
  const radius = Math.floor(3 * sigma + 0.5);
  const size = radius * 2 + 1;
  const kernel = new Float64Array(size);
  let sum = 0;
  for (let i = 0; i < size; i += 1) {
    const x = i - radius;
    const v = Math.exp(-0.5 * (x / sigma) * (x / sigma));
    kernel[i] = v;
    sum += v;
  }
  for (let i = 0; i < size; i += 1) {
    kernel[i] /= sum;
  }
  return kernel;
}

function clampIndex(value: number, limit: number): number {
  if (value < 0) {
    return 0;
  }
  if (value >= limit) {
    return limit - 1;
  }
  return value;
}

/** Round-half-to-even, matching numpy's rint/round behavior. */
function bankersRound(value: number): number {
  const f = Math.floor(value);
  const d = value - f;
  if (d < 0.5) {
    return f;
  }
  if (d > 0.5) {
    return f + 1;
  }
  return f % 2 === 0 ? f : f + 1;
}

/**
 * Separable Gaussian blur with edge replication, applied per channel
 * (including alpha). Pure blur step used for dither descreening.
 */
export function gaussianBlur(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number = DESCREEN_SIGMA
): Uint8ClampedArray {
  const kernel = gaussianKernel(sigma);
  const radius = (kernel.length - 1) / 2;
  const out = new Uint8ClampedArray(pixels.length);
  const tmp = new Float64Array(width * height);

  for (let channel = 0; channel < 4; channel += 1) {
    // Horizontal pass.
    for (let y = 0; y < height; y += 1) {
      const rowBase = y * width;
      for (let x = 0; x < width; x += 1) {
        let acc = 0;
        for (let i = 0; i < kernel.length; i += 1) {
          const sx = clampIndex(x + i - radius, width);
          acc += kernel[i] * pixels[(rowBase + sx) * 4 + channel];
        }
        tmp[rowBase + x] = acc;
      }
    }
    // Vertical pass.
    for (let y = 0; y < height; y += 1) {
      const rowBase = y * width;
      for (let x = 0; x < width; x += 1) {
        let acc = 0;
        for (let i = 0; i < kernel.length; i += 1) {
          const sy = clampIndex(y + i - radius, height);
          acc += kernel[i] * tmp[sy * width + x];
        }
        let v = bankersRound(acc);
        if (v < 0) {
          v = 0;
        } else if (v > 255) {
          v = 255;
        }
        out[(rowBase + x) * 4 + channel] = v;
      }
    }
  }
  return out;
}

/**
 * Detect ordered (Bayer-matrix) dithering via mean horizontal neighbor
 * Pearson correlation on grayscale. Ordered dither alternates every
 * pixel, so adjacent pixels are anti-correlated (negative); natural
 * images and flat art are positively correlated.
 */
export function isOrderedDither(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): boolean {
  const n = width * height;
  if (width < 2 || n < 2) {
    return false;
  }
  // Grayscale as mean of RGB, matching the parity harness.
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    const rowBase = y * width;
    for (let x = 0; x < width - 1; x += 1) {
      const b1 = (rowBase + x) * 4;
      const b2 = (rowBase + x + 1) * 4;
      const g1 = (pixels[b1] + pixels[b1 + 1] + pixels[b1 + 2]) / 3;
      const g2 = (pixels[b2] + pixels[b2 + 1] + pixels[b2 + 2]) / 3;
      sumX += g1;
      sumY += g2;
      sumXX += g1 * g1;
      sumYY += g2 * g2;
      sumXY += g1 * g2;
      count += 1;
    }
  }
  const denom = Math.sqrt(
    (count * sumXX - sumX * sumX) * (count * sumYY - sumY * sumY)
  );
  if (denom <= 0) {
    return false;
  }
  const corr = (count * sumXY - sumX * sumY) / denom;
  return corr < DITHER_CORR_THRESHOLD;
}

/**
 * Dither-aware branch of the decode pipeline: returns the descreened
 * image for ordered-dithered inputs, otherwise null (caller falls back
 * to the standard adaptive edge restore).
 */
export function descreenIfDithered(
  raw: Uint8ClampedArray,
  medianFiltered: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray | null {
  if (isOrderedDither(raw, width, height)) {
    return gaussianBlur(medianFiltered, width, height, DESCREEN_SIGMA);
  }
  return null;
}
