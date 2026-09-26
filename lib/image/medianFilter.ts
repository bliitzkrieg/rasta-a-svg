/**
 * 3x3 median denoise filter for decoded source pixels.
 *
 * A light median pass removes single-pixel speckle and JPEG-style noise
 * before tracing while preserving sharp edges, which gives the vectorizer
 * cleaner color regions to work with. Border pixels are handled by clamping
 * (edge replication), matching the parity harness reference implementation.
 */
export function medianFilter3x3(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  const window = new Array<number>(9);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx += 1) {
            const sx = Math.min(width - 1, Math.max(0, x + dx));
            window[(dy + 1) * 3 + (dx + 1)] =
              pixels[(sy * width + sx) * 4 + channel];
          }
        }
        window.sort((a, b) => a - b);
        out[(y * width + x) * 4 + channel] = window[4];
      }
    }
  }

  return out;
}
