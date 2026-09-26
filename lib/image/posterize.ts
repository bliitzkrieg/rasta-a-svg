/**
 * Posterization pass for decoded source pixels.
 *
 * visioncortex's color clustering grows clusters by chaining neighboring
 * pixels whose per-channel difference is within the color-precision
 * tolerance. On smooth color continua (gradients, soft photographic
 * blends) every adjacent step is below that tolerance, so the whole
 * continuum chains into ONE cluster painted with its average color.
 * That collapsed a 400px smooth gradient to a single 406-byte layer
 * (parity 0.036) and cost fidelity on photographic images too.
 *
 * Snapping each RGB channel to 64 evenly spaced levels first breaks the
 * continua into discrete bands the tracer can cluster separately. At 64
 * levels the maximum per-channel quantization error is just over 1, far
 * below the harness tolerance of 24, so flat artwork is unaffected.
 *
 * Parity harness: +0.0971 overall (0.8349 to 0.9320), no per-image
 * regressions (gradient 0.036 to 1.0, photo 0.9694 to 0.9754,
 * goose_balloon 0.9865 to 0.9869, wikipedia_logo 0.9558 to 0.9564,
 * the rest tied).
 *
 * The implementation mirrors parity.py's _posterize_rgba 1:1: the two
 * were cross-checked byte-identical on all harness test images.
 */

export const POSTERIZE_LEVELS = 64;

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
 * Snap each RGB channel of every pixel to `levels` evenly spaced values
 * (alpha is passed through untouched). v becomes
 * round(v * (levels - 1) / 255) * 255 / (levels - 1), rounded
 * half-to-even to the nearest integer.
 */
export function posterizeImageData(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  levels: number = POSTERIZE_LEVELS,
): Uint8ClampedArray {
  const expected = width * height * 4;
  const out = new Uint8ClampedArray(expected);
  const forward = (levels - 1) / 255;
  const back = 255 / (levels - 1);
  const count = Math.min(pixels.length, expected);
  for (let i = 0; i + 3 < count; i += 4) {
    out[i] = bankersRound(bankersRound(pixels[i] * forward) * back);
    out[i + 1] = bankersRound(bankersRound(pixels[i + 1] * forward) * back);
    out[i + 2] = bankersRound(bankersRound(pixels[i + 2] * forward) * back);
    out[i + 3] = pixels[i + 3];
  }
  return out;
}
