/**
 * Area-weighted box downscale with fractional pixel coverage.
 *
 * Each destination pixel covers a source rectangle; source pixels contribute
 * proportionally to their overlap area. This gives a true area average at any
 * ratio (unlike floor/ceil window approaches which weight edge pixels unevenly
 * at non-integer ratios).
 *
 * Used by both the app (decode.ts) and the parity benchmark (bench.ts) so the
 * benchmark matches the browser byte for byte. Avoids canvas premultiplied-alpha
 * precision loss and gives identical results in every browser (canvas
 * imageSmoothingQuality="high" differs between Chrome, Firefox, and Safari).
 */
export function boxDownscale(
  pixels: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const xScale = srcW / dstW;
  const yScale = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const srcY0 = y * yScale;
    const srcY1 = (y + 1) * yScale;
    const y0i = Math.floor(srcY0);
    const y1i = Math.min(srcH, Math.ceil(srcY1));
    for (let x = 0; x < dstW; x++) {
      const srcX0 = x * xScale;
      const srcX1 = (x + 1) * xScale;
      const x0i = Math.floor(srcX0);
      const x1i = Math.min(srcW, Math.ceil(srcX1));
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        area = 0;
      for (let sy = y0i; sy < y1i; sy++) {
        const yOverlap = Math.min(sy + 1, srcY1) - Math.max(sy, srcY0);
        for (let sx = x0i; sx < x1i; sx++) {
          const xOverlap = Math.min(sx + 1, srcX1) - Math.max(sx, srcX0);
          const weight = xOverlap * yOverlap;
          const o = (sy * srcW + sx) * 4;
          const al = pixels[o + 3] / 255;
          r += pixels[o] * al * weight;
          g += pixels[o + 1] * al * weight;
          b += pixels[o + 2] * al * weight;
          a += al * weight;
          area += weight;
        }
      }
      const o = (y * dstW + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round((a / area) * 255);
      } else {
        out[o + 3] = 0;
      }
    }
  }
  return out;
}
