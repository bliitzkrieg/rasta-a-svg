/**
 * Gated palette-snap pass over the composited label map.
 *
 * After posterization, anti-aliased fringes and soft edges leave pixels
 * whose colors sit between the artwork's true palette colors. The tracer's
 * exact-color clustering treats each distinct fringe tint as its own
 * cluster, so a single glyph edge can splinter into several thin tint
 * bands that trace as noisy boundaries. Snapping every pixel to the
 * nearest of the image's top-k colors by pixel count collapses those
 * fringes onto the dominant palette before the tracer sees them.
 *
 * The snap is applied adaptively: it is kept only when the image has more
 * than k unique opaque colors AND the top-k colors already cover at least
 * PALETTE_SNAP_MIN_TOPK_COVERAGE of opaque pixels. That combination fires
 * on flat artwork with fringes (text, logos: diagonal_text, goose_balloon,
 * text_logo) and skips everything else: images with few colors don't need
 * it, and complex content (gradient, photo, wikipedia_logo) where the top
 * colors cover little would be damaged by the collapse. Measured top-8
 * coverage on the parity set: gainers 0.977 to 1.000, skipped images
 * 0.003 to 0.346 (transparency 1.000 but only 6 unique colors), so 0.90
 * separates the regimes with wide margin.
 *
 * Parity harness: +0.0003 overall (0.9912 to 0.9915), zero per-image
 * regressions (diagonal_text 0.9914 to 0.9918, goose_balloon 0.9931 to
 * 0.9952, text_logo 0.9961 to 0.9969; all others tie).
 *
 * The implementation mirrors parity.py's _palette_snap_rgba plus the
 * snapgate gate 1:1: the two are cross-checked byte-identical on all
 * harness test images (see paletteSnap.test.ts). Distances are 32-bit
 * squared RGB differences; ties resolve to the lowest palette index.
 */

export const PALETTE_SNAP_COLORS = 8;
export const PALETTE_SNAP_MIN_TOPK_COVERAGE = 0.9;

type Rgb = [number, number, number];

function rgbKey(r: number, g: number, b: number): number {
  return r * 65536 + g * 256 + b;
}

/**
 * Count unique RGB colors. When opaqueOnly is set, only pixels with
 * alpha 255 participate (used by the gate); otherwise every pixel's RGB
 * participates (used by the snap itself, mirroring the harness).
 */
function countColors(
  pixels: Uint8ClampedArray,
  opaqueOnly: boolean,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (opaqueOnly && pixels[i + 3] !== 255) {
      continue;
    }
    const key = rgbKey(pixels[i], pixels[i + 1], pixels[i + 2]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function keyToRgb(key: number): Rgb {
  return [Math.floor(key / 65536), Math.floor(key / 256) % 256, key % 256];
}

/**
 * Snap every pixel's RGB to the nearest of the top `colors` colors by
 * pixel count (alpha untouched). Returns the input unchanged when the
 * image has at most `colors` unique colors.
 */
export function paletteSnapImageData(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  colors: number = PALETTE_SNAP_COLORS,
): Uint8ClampedArray {
  const expected = width * height * 4;
  const count = Math.min(pixels.length, expected);
  const counts = countColors(pixels, false);
  if (counts.size <= colors) {
    return pixels.slice(0, count);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const palette: Rgb[] = ranked.slice(0, colors).map(([key]) => keyToRgb(key));
  const out = new Uint8ClampedArray(count);
  for (let i = 0; i + 3 < count; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    let best = 0;
    let bestD2 = Infinity;
    for (let j = 0; j < palette.length; j++) {
      const p = palette[j];
      const dr = r - p[0];
      const dg = g - p[1];
      const db = b - p[2];
      const d2 = dr * dr + dg * dg + db * db;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = j;
      }
    }
    const chosen = palette[best];
    out[i] = chosen[0];
    out[i + 1] = chosen[1];
    out[i + 2] = chosen[2];
    out[i + 3] = pixels[i + 3];
  }
  return out;
}

/**
 * Decide whether the palette snap should be applied: more than `colors`
 * unique opaque colors, and the top `colors` cover at least
 * `minCoverage` of opaque pixels.
 */
export function shouldPaletteSnap(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  colors: number = PALETTE_SNAP_COLORS,
  minCoverage: number = PALETTE_SNAP_MIN_TOPK_COVERAGE,
): boolean {
  const counts = countColors(pixels, true);
  if (counts.size <= colors) {
    return false;
  }
  const sorted = [...counts.values()].sort((a, b) => b - a);
  let top = 0;
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    total += sorted[i];
    if (i < colors) {
      top += sorted[i];
    }
  }
  return total > 0 && top / total >= minCoverage;
}

/**
 * Gated palette snap: apply the snap only when shouldPaletteSnap says
 * the image is flat artwork with fringes; otherwise return the input
 * unchanged.
 */
export function gatedPaletteSnap(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  colors: number = PALETTE_SNAP_COLORS,
  minCoverage: number = PALETTE_SNAP_MIN_TOPK_COVERAGE,
): Uint8ClampedArray {
  if (!shouldPaletteSnap(pixels, width, height, colors, minCoverage)) {
    return pixels.slice(0, width * height * 4);
  }
  return paletteSnapImageData(pixels, width, height, colors);
}
