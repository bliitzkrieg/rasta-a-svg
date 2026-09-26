/**
 * Alpha compositing pass for decoded source pixels.
 *
 * The vector tracer has no alpha channel: its Rust pipeline snaps
 * semi-transparent pixels to fully opaque or fully transparent at the
 * halfway point, then keys the transparent ones out as background. On
 * genuinely translucent artwork (soft shadows, glassy overlays, the
 * transparency test image) that snap deletes or miscolors large regions:
 * pixels just below half opacity vanish, pixels just above render at full
 * strength, while the reference blends them over the page background.
 *
 * Compositing partial-alpha pixels over white first reproduces the
 * blended appearance the tracer would otherwise have to guess. Fully
 * transparent pixels are left alone so background keying still removes
 * real transparency instead of baking in a white backdrop.
 *
 * The pass is gated: it only runs when more than 5% of pixels are
 * partially transparent. On near-opaque images the partial alpha is a
 * thin downscale fringe, and compositing it into tint bands clusters
 * slightly worse than the binary snap (parity harness: goose_balloon
 * 0.9869 to 0.9837, wikipedia_logo 0.9564 to 0.9506 ungated). With the
 * gate those images are untouched and the translucent image goes from
 * 0.4994 to 0.9916 parity (+0.0492 overall, no per-image regressions).
 *
 * Parity harness: mirrors parity.py's _composite_alpha_rgba 1:1 (round
 * half to even, same as numpy's rint); the two were cross-checked
 * byte-identical on all harness test images.
 */

/** Fraction of partially transparent pixels above which compositing runs. */
export const COMPOSITE_ALPHA_GATE = 0.05;

/** Round-half-to-even, matching numpy's rint behavior. */
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
 * Composite partially transparent pixels over white. Pixels that are
 * fully transparent keep alpha 0 (so the tracer's background keying
 * still applies); every other pixel ends up fully opaque with its
 * white-blended color. When at most COMPOSITE_ALPHA_GATE of pixels are
 * partially transparent, the input is returned unchanged (copied).
 */
export function compositeAlphaOverWhite(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const expected = width * height * 4;
  const count = Math.min(pixels.length, expected);
  const out = new Uint8ClampedArray(expected);
  out.set(pixels.subarray(0, count));
  const total = Math.floor(count / 4);
  if (total === 0) {
    return out;
  }
  let partial = 0;
  for (let i = 3; i < count; i += 4) {
    const a = pixels[i];
    if (a > 0 && a < 255) {
      partial += 1;
    }
  }
  if (partial / total <= COMPOSITE_ALPHA_GATE) {
    return out;
  }
  for (let i = 0; i + 3 < count; i += 4) {
    const a = pixels[i + 3];
    if (a === 0 || a === 255) {
      continue;
    }
    const t = a / 255;
    const w = 255 * (1 - t);
    out[i] = bankersRound(pixels[i] * t + w);
    out[i + 1] = bankersRound(pixels[i + 1] * t + w);
    out[i + 2] = bankersRound(pixels[i + 2] * t + w);
    out[i + 3] = 255;
  }
  return out;
}
