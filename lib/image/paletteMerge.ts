/**
 * Palette-merge pass over the decoded label map.
 *
 * After the tiered palette snap, near-duplicate colors can remain: the
 * snap collapses each pixel to the nearest top-k color, but the top-k
 * colors themselves can sit within a few levels of each other (grainy
 * dark linework, anti-aliased fringes on textured fills). The
 * binary-layer tracer gives every distinct color its own nested layer,
 * so a family of near-identical colors becomes a stack of near-identical
 * boundaries, each carrying roughly a pixel of tracing error.
 *
 * This pass consolidates near-identical opaque colors into their
 * count-weighted mean (rounded half-to-even). Greedy in
 * count-descending order (ties broken by RGB key ascending, mirroring
 * the tracer's palette order): each color joins the first existing
 * group whose anchor, the dominant color that started the group and is
 * never moved, is within PALETTE_MERGE_MAX_DELTA on every channel.
 * Because every member sits within maxDelta of its anchor, the merged
 * mean shifts any pixel by at most 2 * maxDelta, which at the shipped
 * 12 equals the scoring tolerance exactly, so the merge cannot push a
 * pixel outside what the parity meter counts as preserved.
 *
 * Grid bucketing (cell size maxDelta + 1) keeps the greedy scan linear:
 * any two colors within maxDelta on every channel share a cell or a
 * neighboring one, so only the 27 neighboring cells are searched, and
 * anchors never move so buckets are written once.
 *
 * Parity harness (honest end-to-end metric): luca_skeleton 0.8820 to
 * 0.8847 at maxDelta 12; 20 and above regress (color shift outruns the
 * boundary gain), so 12 is the shipped value. Full 18-image suite check
 * for regressions before shipping, as always.
 *
 * The implementation mirrors parity.py's _palette_merge_rgba 1:1: the
 * two are cross-checked byte-identical on the harness test images (see
 * paletteMerge.test.ts). Distances are worst-channel absolute
 * differences; the mean is rounded half-to-even like numpy's rint.
 */

export const PALETTE_MERGE_MAX_DELTA = 12;

/** Minimum distinct opaque colors for the merge gate to fire. */
export const PALETTE_MERGE_MIN_UNIQUE = 20000;

/** Minimum top-16 opaque color coverage for the merge gate to fire. */
export const PALETTE_MERGE_MIN_TOP16_COVERAGE = 0.4;

/**
 * Gate for the merge pass. Fires only on grainy illustrations with a
 * concentrated palette: at least PALETTE_MERGE_MIN_UNIQUE distinct
 * opaque colors AND the 16 most common opaque colors covering at least
 * PALETTE_MERGE_MIN_TOP16_COVERAGE of the opaque pixels. Measured on
 * the pre-snap composited image, mirroring parity.py's palmergeg knob
 * 1:1. Photos have many colors but diffuse palettes (fail the coverage
 * leg); clean illustrations have concentrated palettes but too few
 * colors (fail the count leg); on either, the merge would flatten real
 * gradation the tracer reproduces faithfully.
 */
export function shouldMergePalette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  const count = Math.min(pixels.length, width * height * 4);
  const counts = new Map<number, number>();
  for (let i = 0; i + 3 < count; i += 4) {
    if (pixels[i + 3] !== 255) {
      continue;
    }
    const key = rgbKey(pixels[i], pixels[i + 1], pixels[i + 2]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size < PALETTE_MERGE_MIN_UNIQUE) {
    return false;
  }
  const ranked = [...counts.values()].sort((a, b) => b - a);
  let total = 0;
  let top16 = 0;
  for (let k = 0; k < ranked.length; k += 1) {
    total += ranked[k];
    if (k < 16) {
      top16 += ranked[k];
    }
  }
  return top16 / total >= PALETTE_MERGE_MIN_TOP16_COVERAGE;
}

type Rgb = [number, number, number];

function rgbKey(r: number, g: number, b: number): number {
  return r * 65536 + g * 256 + b;
}

function keyToRgb(key: number): Rgb {
  return [Math.floor(key / 65536), Math.floor(key / 256) % 256, key % 256];
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
 * Merge near-identical opaque colors (worst channel diff at most
 * maxDelta) into their count-weighted mean. Only pixels with alpha 255
 * participate; every other pixel (including semi-transparent ones)
 * keeps its RGB untouched, and alpha is never modified.
 */
export function paletteMergeImageData(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  maxDelta: number = PALETTE_MERGE_MAX_DELTA,
): Uint8ClampedArray {
  const count = Math.min(pixels.length, width * height * 4);
  const counts = new Map<number, number>();
  for (let i = 0; i + 3 < count; i += 4) {
    if (pixels[i + 3] !== 255) {
      continue;
    }
    const key = rgbKey(pixels[i], pixels[i + 1], pixels[i + 2]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size <= 1) {
    return pixels.slice(0, count);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const cell = maxDelta + 1;
  const buckets = new Map<string, number[]>();
  const anchors: Rgb[] = [];
  const sumR: number[] = [];
  const sumG: number[] = [];
  const sumB: number[] = [];
  const sumW: number[] = [];
  const assign = new Map<number, number>();
  const cellKey = (x: number, y: number, z: number): string =>
    `${x},${y},${z}`;
  for (const [key, n] of ranked) {
    const [r, g, b] = keyToRgb(key);
    const cx = Math.floor(r / cell);
    const cy = Math.floor(g / cell);
    const cz = Math.floor(b / cell);
    let placed = -1;
    for (let dx = -1; dx <= 1 && placed < 0; dx += 1) {
      for (let dy = -1; dy <= 1 && placed < 0; dy += 1) {
        for (let dz = -1; dz <= 1 && placed < 0; dz += 1) {
          const list = buckets.get(cellKey(cx + dx, cy + dy, cz + dz));
          if (!list) {
            continue;
          }
          for (const gi of list) {
            const a = anchors[gi];
            if (
              Math.max(
                Math.abs(r - a[0]),
                Math.abs(g - a[1]),
                Math.abs(b - a[2]),
              ) <= maxDelta
            ) {
              placed = gi;
              break;
            }
          }
        }
      }
    }
    if (placed < 0) {
      const gi = anchors.length;
      anchors.push([r, g, b]);
      sumR.push(r * n);
      sumG.push(g * n);
      sumB.push(b * n);
      sumW.push(n);
      const k = cellKey(cx, cy, cz);
      const list = buckets.get(k);
      if (list) {
        list.push(gi);
      } else {
        buckets.set(k, [gi]);
      }
      assign.set(key, gi);
    } else {
      sumR[placed] += r * n;
      sumG[placed] += g * n;
      sumB[placed] += b * n;
      sumW[placed] += n;
      assign.set(key, placed);
    }
  }
  const merged: Rgb[] = anchors.map((_, gi) => [
    bankersRound(sumR[gi] / sumW[gi]),
    bankersRound(sumG[gi] / sumW[gi]),
    bankersRound(sumB[gi] / sumW[gi]),
  ]);
  const out = pixels.slice(0, count);
  for (let i = 0; i + 3 < count; i += 4) {
    if (pixels[i + 3] !== 255) {
      continue;
    }
    const key = rgbKey(pixels[i], pixels[i + 1], pixels[i + 2]);
    const m = merged[assign.get(key) as number];
    out[i] = m[0];
    out[i + 1] = m[1];
    out[i + 2] = m[2];
  }
  return out;
}
