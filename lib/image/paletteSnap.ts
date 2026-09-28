/**
 * Tiered gated palette-snap pass over the composited label map.
 *
 * After posterization, anti-aliased fringes and soft edges leave pixels
 * whose colors sit between the artwork's true palette colors. The tracer's
 * exact-color clustering treats each distinct fringe tint as its own
 * cluster, so a single glyph edge can splinter into several thin tint
 * bands that trace as noisy boundaries. Snapping every pixel to the
 * nearest of the image's top-k colors by pixel count collapses those
 * fringes onto the dominant palette before the tracer sees them.
 *
 * The snap strength is chosen by a three-tier gate on the opaque color
 * histogram:
 * - Tier 1: at most 8 unique colors -> snap to n (all of them). With so
 *   few colors there are no fringe tints to collapse (the snap is the
 *   identity), and the binary-layer tracer reproduces each color with an
 *   exact walk. Fires on few-color art like thin_lines (3 colors: the old
 *   top-2 >= 95% rule snapped its red lines away) and line_art.
 * - Tier 2: more than 8 unique colors and top-8 cover >= 90% -> snap
 *   to 8. Fires on flat artwork with fringes (diagonal_text,
 *   goose_balloon, text_logo, dither).
 * - Tier 3: more than 8 unique colors and top-16 cover >= 40% -> snap
 *   to 16. Fires on clustered mid-complexity images like wikipedia_logo
 *   whose posterized gradient bands widen and trace more cleanly.
 * Diffuse content (photo, gradient, noisy_photo) matches no tier and is
 * left unchanged. Measured top-16 coverage on the parity set: tier-3
 * gainer 0.487, skipped images 0.006 to 0.145, so 0.40 separates the
 * regimes with wide margin.
 *
 * Parity harness: +0.0002 overall (0.9939 to 0.9941), zero per-image
 * regressions (chart +0.0005, diagonal_text +0.0007, icons +0.0010,
 * text_logo +0.0001, thin_lines +0.0011, wikipedia_logo +0.0018; all
 * others tie).
 *
 * The implementation mirrors parity.py's tiered gate 1:1: the two are
 * cross-checked byte-identical on all harness test images (see
 * paletteSnap.test.ts). Distances are 32-bit squared RGB differences;
 * ties resolve to the lowest palette index.
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

export const PALETTE_SNAP_TIER3_COLORS = 16;
export const PALETTE_SNAP_TIER3_MIN_TOP16_COVERAGE = 0.4;

/**
 * Decide which palette-snap tier applies, or null for no snap.
 *
 * Three tiers, checked in order:
 * - Tier 1 (few colors): at most 8 unique opaque colors -> tier = n (all
 *   of them). The snap to n is the identity (no tints to collapse), and
 *   the binary-layer tracer gives each color an exact walk. Fires on
 *   few-color art like thin_lines (3 colors) and line_art (2 colors).
 * - Tier 2 (flat artwork with fringes): more than 8 unique opaque colors
 *   and the top 8 cover >= 90%. The original gate; fires on text/logos.
 * - Tier 3 (clustered mid-complexity): more than 8 unique opaque colors
 *   and the top 16 cover >= 40%. Fires on images like wikipedia_logo
 *   whose posterized gradient bands form tight color clusters; snapping
 *   to 16 widens the bands so boundaries trace more accurately. Skips
 *   diffuse content (photo, gradient, noisy_photo) where top-16 coverage
 *   is 0.006 to 0.145.
 */
export function paletteSnapTier(pixels: Uint8ClampedArray): number | null {
  const counts = countColors(pixels, true);
  const n = counts.size;
  if (n === 0) {
    return null;
  }
  const sorted = [...counts.values()].sort((a, b) => b - a);
  let total = 0;
  let top8 = 0;
  let top16 = 0;
  for (let i = 0; i < sorted.length; i++) {
    total += sorted[i];
    if (i < 8) top8 += sorted[i];
    if (i < 16) top16 += sorted[i];
  }
  if (total === 0) {
    return null;
  }
  if (n <= 8) {
    return n;
  }
  if (top8 / total >= PALETTE_SNAP_MIN_TOPK_COVERAGE) {
    return PALETTE_SNAP_COLORS;
  }
  if (top16 / total >= PALETTE_SNAP_TIER3_MIN_TOP16_COVERAGE) {
    return PALETTE_SNAP_TIER3_COLORS;
  }
  return null;
}

/**
 * Tiered gated palette snap: pick the snap strength via paletteSnapTier;
 * return the input unchanged when no tier fires.
 */
export function gatedPaletteSnapTiered(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const tier = paletteSnapTier(pixels);
  if (tier === null) {
    return pixels.slice(0, width * height * 4);
  }
  return paletteSnapImageData(pixels, width, height, tier);
}
