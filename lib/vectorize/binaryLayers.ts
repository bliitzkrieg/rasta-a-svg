/**
 * Per-color binary-layer tracing for flat artwork.
 *
 * On images where the tiered palette-snap gate fires (flat logos, text,
 * icons), the color-mode tracer splinters each palette color into many
 * small clusters and misplaces boundaries by 1-2px on thin bands. Tracing
 * each palette color as its own binary mask instead gives every color an
 * exact pixel-corner walk, and stacking the masks background-first
 * (nested, like hierarchical stacked mode) keeps abutting colors
 * overlapping so no seams open between them.
 *
 * Parity harness: +0.0016 overall (0.9941 to 0.9957), zero per-image
 * regressions (chart +0.0041, diagonal_text +0.0057, dither +0.0045,
 * goose_balloon +0.0018, text_logo +0.0023, line_art +0.0016,
 * wikipedia_logo +0.0010; all others tie).
 *
 * The implementation mirrors parity.py's BINARY_LAYERS mode 1:1: the two
 * are cross-checked on the harness test images (see binaryLayers.test.ts).
 */
import type { VectorLayer } from "@/types/vector";

export type Rgb = [number, number, number];

export interface BinaryTraceOutput {
  width: number;
  height: number;
  layers: VectorLayer[];
  svg: string;
  metrics: { nodeCount: number; pathCount: number };
}

export type WasmTraceFn = (
  width: number,
  height: number,
  pixels: Uint8Array,
  optionsJson: string,
) => string;

function rgbKey(r: number, g: number, b: number): number {
  return r * 65536 + g * 256 + b;
}

function keyToRgb(key: number): Rgb {
  return [Math.floor(key / 65536), Math.floor(key / 256) % 256, key % 256];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0").toUpperCase())
      .join("")
  );
}

/**
 * The top `tier` opaque colors by pixel count (count desc, rgb key asc on
 * ties). Opaque-only, mirroring the palette-snap gate's histogram.
 */
export function topOpaquePalette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tier: number,
): Rgb[] {
  const counts = new Map<number, number>();
  const n = Math.min(pixels.length, width * height * 4);
  for (let i = 0; i + 3 < n; i += 4) {
    if (pixels[i + 3] !== 255) {
      continue;
    }
    const key = rgbKey(pixels[i], pixels[i + 1], pixels[i + 2]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, tier)
    .map(([key]) => keyToRgb(key));
}

/**
 * For each pixel, its palette rank (0 = most common) measured on the
 * ORIGINAL (pre-prep) image composited over white, or -1 when the pixel
 * data is missing. Every pixel is snapped to its nearest palette color.
 *
 * Preprocessing (posterize, majority vote, median) shifts fringe and blend
 * pixels across palette Voronoi boundaries, so ranking the prepped pixels
 * misassigns them to the wrong layer and the recolored fill then misses the
 * honest metric. The original colors assign each pixel to the palette color
 * its true color is nearest to, which is the layer whose recolored fill can
 * actually match it. Fully transparent pixels composite to white and take
 * the white rank, so soft backgrounds are painted instead of left to the
 * page. Measured on the honest metric (v1.0.30): text_logo 0.999010 to
 * 1.000000, goose_balloon 0.997012 to 0.998028, zero regressions on the
 * other seven tier images.
 */
export function paletteRanksOnOriginals(
  originalPixels: Uint8ClampedArray,
  width: number,
  height: number,
  palette: Rgb[],
): Int32Array {
  const ranks = new Int32Array(width * height).fill(-1);
  if (palette.length === 0) {
    return ranks;
  }
  const n = Math.min(originalPixels.length, width * height * 4);
  for (let p = 0; p < width * height && p * 4 + 3 < n; p += 1) {
    const o = p * 4;
    // Fully transparent pixels get rank -1 so no layer paints them.
    // They show as transparent instead of a painted white rectangle.
    if (originalPixels[o + 3] === 0) {
      ranks[p] = -1;
      continue;
    }
    const a = originalPixels[o + 3] / 255;
    const inv = 1 - a;
    const r = originalPixels[o] * a + 255 * inv;
    const g = originalPixels[o + 1] * a + 255 * inv;
    const b = originalPixels[o + 2] * a + 255 * inv;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i += 1) {
      const [pr, pg, pb] = palette[i];
      const d = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    ranks[p] = best;
  }
  return ranks;
}

/**
 * For each pixel, its palette rank (0 = most common), or -1 when the pixel
 * is fully transparent or its color is outside the palette. Semi-transparent
 * pixels (0 < alpha < 255) are composited onto white and snapped to the
 * nearest palette color, so soft anti-aliased edges are traced instead of
 * dropped (which left white gaps on the wikipedia logo).
 *
 * Used only when no original pixels are available; otherwise
 * paletteRanksOnOriginals ranks on the true colors (see above).
 */
export function paletteRanks(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  palette: Rgb[],
): Int32Array {
  const index = new Map<number, number>();
  for (let i = 0; i < palette.length; i += 1) {
    const [r, g, b] = palette[i];
    index.set(rgbKey(r, g, b), i);
  }
  const ranks = new Int32Array(width * height).fill(-1);
  const n = Math.min(pixels.length, width * height * 4);
  for (let p = 0; p < width * height && p * 4 + 3 < n; p += 1) {
    const o = p * 4;
    const alpha = pixels[o + 3];
    if (alpha === 255) {
      ranks[p] =
        index.get(rgbKey(pixels[o], pixels[o + 1], pixels[o + 2])) ?? -1;
    } else if (alpha > 0 && palette.length > 0) {
      const a = alpha / 255;
      const r = pixels[o] * a + 255 * (1 - a);
      const g = pixels[o + 1] * a + 255 * (1 - a);
      const b = pixels[o + 2] * a + 255 * (1 - a);
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < palette.length; i += 1) {
        const [pr, pg, pb] = palette[i];
        const d = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      ranks[p] = best;
    }
  }
  return ranks;
}

/**
 * Extract the inner path entries from a tracer SVG document.
 */
export function innerSvgPaths(svg: string): string {
  const m = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg);
  return m ? m[1].trim() : svg;
}

/**
 * Scoring tolerance of the honest parity metric: a pixel counts as
 * matching when its worst RGB channel differs by at most this much.
 */
const RECOLOR_TOLERANCE = 24;
/**
 * How many frequent original colors per layer are tried as fill
 * candidates (plus the current palette color, which is always tried).
 */
const RECOLOR_TOP_CANDIDATES = 16;
/**
 * Flat-region guard only applies to layers with at least this many
 * pixels, so degenerate speck layers keep the conservative tie-break.
 */
const RECOLOR_FLAT_MIN_PIXELS = 16;
/**
 * How many frequent original colors among a rank's leftover pixels are
 * tried as sub-ball fill candidates by splitSoupRanks. Wider than the
 * recolor's top-16 because leftovers are a small, diverse pixel set.
 */
const SPLIT_TOP_CANDIDATES = 64;
/**
 * A sub-ball must cover at least this many leftover pixels to earn its
 * own traced layer; mirrors RECOLOR_FLAT_MIN_PIXELS.
 */
const SPLIT_MIN_PIXELS = 16;

/**
 * Recolor each binary-layer fill against the ORIGINAL (pre-prep) image.
 *
 * The palette colors come from the prepped pixels, but the honest metric
 * scores the rendered SVG against the original input. Preprocessing
 * (posterize, majority vote, median) shifts colors, so a palette color can
 * sit outside the scoring tolerance of the true original colors at that
 * layer's pixels, and the tracer then bakes the shifted color into every
 * pixel the layer paints. For each layer, gather the original colors
 * (composited over white, like the metric's reference) at its rank pixels
 * and pick the fill with the best within-tolerance coverage: the current
 * palette color first, then the most frequent exact original colors
 * (count desc, rgb key asc). The current color wins ties, so fills only
 * change on measured gain. Parity harness on the honest metric:
 * chart 0.9917 to 1.0000, bathtub 0.9902 to 0.9933, goose 0.9913 to
 * 0.9929, text_logo 0.9986 to 0.9989, zero regressions on the other six
 * tier images.
 */
export function recolorPaletteFills(
  originalPixels: Uint8ClampedArray,
  width: number,
  height: number,
  palette: Rgb[],
  ranks: Int32Array,
): Rgb[] {
  const n = Math.min(
    Math.floor(originalPixels.length / 4),
    width * height,
    ranks.length,
  );
  // Original color of pixel p, composited over white like the metric's
  // reference. Stored once so candidate scoring is a single pass each.
  const orig = new Uint8Array(n * 3);
  for (let p = 0; p < n; p += 1) {
    const o = p * 4;
    const a = originalPixels[o + 3];
    const t = p * 3;
    if (a === 255) {
      orig[t] = originalPixels[o];
      orig[t + 1] = originalPixels[o + 1];
      orig[t + 2] = originalPixels[o + 2];
    } else if (a === 0) {
      orig[t] = 255;
      orig[t + 1] = 255;
      orig[t + 2] = 255;
    } else {
      const af = a / 255;
      const inv = 1 - af;
      orig[t] = Math.round(originalPixels[o] * af + 255 * inv);
      orig[t + 1] = Math.round(originalPixels[o + 1] * af + 255 * inv);
      orig[t + 2] = Math.round(originalPixels[o + 2] * af + 255 * inv);
    }
  }
  // One pass: per-layer pixel index lists plus original-color frequencies.
  const layerPixels: number[][] = palette.map(() => []);
  const counts: Map<number, number>[] = palette.map(() => new Map());
  for (let p = 0; p < n; p += 1) {
    const r = ranks[p];
    if (r < 0 || r >= palette.length) {
      continue;
    }
    layerPixels[r].push(p);
    const t = p * 3;
    const key = rgbKey(orig[t], orig[t + 1], orig[t + 2]);
    const m = counts[r];
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  const fills: Rgb[] = [];
  for (let r = 0; r < palette.length; r += 1) {
    const members = layerPixels[r];
    if (members.length === 0) {
      fills.push(palette[r]);
      continue;
    }
    const sorted = [...counts[r].entries()].sort(
      (a, b) => b[1] - a[1] || a[0] - b[0],
    );
    // Flat-region guard: when one exact original color dominates a
    // substantial layer, it is the true fill. The coverage vote below can
    // otherwise elect a less-frequent anti-aliased fringe blend (it sits
    // mid-gradient, so it covers the body plus more fringe within
    // tolerance), dulling the whole layer to a color the eye reads as
    // wrong even though the scoring tolerance cannot see the shift.
    // Shaded or gradient layers have no dominant color and keep the
    // coverage vote, which is what recovers their true tones. The pixel
    // minimum keeps degenerate speck layers on the conservative
    // tie-break below.
    const [modeKey] = sorted[0];
    // Use the mode color for all layers (Claude feedback item 5): it maximizes
    // exact pixel matches. The residual layer corrects any errors, so this is
    // safe. For gradients, the mode may not be ideal, but the residual patches
    // the difference.
    // Note: RECOLOR_FLAT_MIN_PIXELS and the 50% threshold are kept for the
    // tiny-layer snap below, which needs to distinguish large vs tiny layers.
    fills.push(keyToRgb(modeKey));
    continue;
    const top = sorted
      .slice(0, RECOLOR_TOP_CANDIDATES)
      .map(([key]) => keyToRgb(key));
    const current = palette[r];
    const currentKey = rgbKey(current[0], current[1], current[2]);
    const candidates: Rgb[] = [current];
    for (const c of top) {
      if (rgbKey(c[0], c[1], c[2]) !== currentKey) {
        candidates.push(c);
      }
    }
    let best = current;
    let bestCovered = -1;
    for (const [cr, cg, cb] of candidates) {
      let covered = 0;
      for (const p of members) {
        const t = p * 3;
        const worst = Math.max(
          Math.abs(orig[t] - cr),
          Math.abs(orig[t + 1] - cg),
          Math.abs(orig[t + 2] - cb),
        );
        if (worst <= RECOLOR_TOLERANCE) {
          covered += 1;
        }
      }
      if (covered > bestCovered) {
        bestCovered = covered;
        best = [cr, cg, cb];
      }
    }
    fills.push(best);
  }
  // Edge-fragment snap: tiny layers (< RECOLOR_FLAT_MIN_PIXELS pixels) are
  // usually anti-aliased fringe splinters. Their coverage vote can elect a
  // blended mid-gradient color that renders as a visible halo line around
  // the shape, even though the scoring tolerance cannot see the shift.
  // Snap each tiny layer to the nearest large layer's fill (by RGB distance
  // from the tiny layer's mode color), so fringe pixels take the adjacent
  // solid color instead of a blend.
  const largeFills: Rgb[] = [];
  const largeIdx: number[] = [];
  for (let r = 0; r < palette.length; r += 1) {
    if (layerPixels[r].length >= RECOLOR_FLAT_MIN_PIXELS) {
      largeFills.push(fills[r]);
      largeIdx.push(r);
    }
  }
  if (largeFills.length > 0) {
    for (let r = 0; r < palette.length; r += 1) {
      if (layerPixels[r].length >= RECOLOR_FLAT_MIN_PIXELS) {
        continue;
      }
      if (layerPixels[r].length === 0) {
        continue;
      }
      // Mode color of the tiny layer (most frequent exact original).
      const tinySorted = [...counts[r].entries()].sort(
        (a, b) => b[1] - a[1] || a[0] - b[0],
      );
      const tinyMode = keyToRgb(tinySorted[0][0]);
      let bestLarge = 0;
      let bestDist = Infinity;
      for (let li = 0; li < largeFills.length; li += 1) {
        const lf = largeFills[li];
        const dist = Math.max(
          Math.abs(tinyMode[0] - lf[0]),
          Math.abs(tinyMode[1] - lf[1]),
          Math.abs(tinyMode[2] - lf[2]),
        );
        if (dist < bestDist) {
          bestDist = dist;
          bestLarge = li;
        }
      }
      fills[r] = largeFills[bestLarge];
    }
  }
  return fills;
}

/**
 * Split heterogeneous ("soup") binary ranks into sub-layers (v1.0.32).
 *
 * A rank's shipped fill is one color, but prep quantization can group a
 * whole anti-aliased blend ramp under one rank: the rank is measured on
 * the original colors against the prepped palette, so the ramp's pixels
 * all land on the nearest palette color while their true colors span a
 * range no single 24-ball can cover. The leftover pixels (farther than
 * the scoring tolerance from the shipped fill) are greedily carved into
 * 24-radius balls, set-cover style on the honest hit criterion; each
 * ball of at least SPLIT_MIN_PIXELS pixels becomes its own sub-layer
 * with its own fill, painted right after its parent rank.
 *
 * Self-gating: a rank whose shipped fill already covers every member
 * within tolerance produces no balls, so images at 1.0 are unaffected.
 * Returns reindexed integer ranks preserving the nested paint order.
 *
 * Parity harness: mirrors parity.py _split_soup_ranks 1:1.
 */
export function splitSoupRanks(
  originalPixels: Uint8ClampedArray,
  width: number,
  height: number,
  ranks: Int32Array,
  fills: Rgb[],
): { ranks: Int32Array; fills: Rgb[] } {
  const n = Math.min(
    Math.floor(originalPixels.length / 4),
    width * height,
    ranks.length,
  );
  // Original color of pixel p, composited over white like the metric's
  // reference (same compositing as recolorPaletteFills).
  const orig = new Uint8Array(n * 3);
  for (let p = 0; p < n; p += 1) {
    const o = p * 4;
    const a = originalPixels[o + 3];
    const t = p * 3;
    if (a === 255) {
      orig[t] = originalPixels[o];
      orig[t + 1] = originalPixels[o + 1];
      orig[t + 2] = originalPixels[o + 2];
    } else if (a === 0) {
      orig[t] = 255;
      orig[t + 1] = 255;
      orig[t + 2] = 255;
    } else {
      const af = a / 255;
      const inv = 1 - af;
      orig[t] = Math.round(originalPixels[o] * af + 255 * inv);
      orig[t + 1] = Math.round(originalPixels[o + 1] * af + 255 * inv);
      orig[t + 2] = Math.round(originalPixels[o + 2] * af + 255 * inv);
    }
  }
  const nRanks = fills.length;
  const layerPixels: number[][] = fills.map(() => []);
  for (let p = 0; p < n; p += 1) {
    const r = ranks[p];
    if (r >= 0 && r < nRanks) {
      layerPixels[r].push(p);
    }
  }
  const within = (p: number, c: Rgb): boolean => {
    const t = p * 3;
    return (
      Math.max(
        Math.abs(orig[t] - c[0]),
        Math.abs(orig[t + 1] - c[1]),
        Math.abs(orig[t + 2] - c[2]),
      ) <= RECOLOR_TOLERANCE
    );
  };
  const balls: { fill: Rgb; pixels: number[] }[][] = fills.map(() => []);
  for (let r = 0; r < nRanks; r += 1) {
    const members = layerPixels[r];
    if (members.length === 0) {
      continue;
    }
    const parentFill = fills[r];
    let remaining = members.filter((p) => !within(p, parentFill));
    while (remaining.length >= SPLIT_MIN_PIXELS) {
      const counts = new Map<number, number>();
      for (const p of remaining) {
        const t = p * 3;
        const key = rgbKey(orig[t], orig[t + 1], orig[t + 2]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const sorted = [...counts.entries()].sort(
        (a, b) => b[1] - a[1] || a[0] - b[0],
      );
      const cands = sorted
        .slice(0, SPLIT_TOP_CANDIDATES)
        .map(([key]) => keyToRgb(key));
      let best = cands[0];
      let bestCovered: number[] = [];
      for (const c of cands) {
        const covered = remaining.filter((p) => within(p, c));
        if (covered.length > bestCovered.length) {
          best = c;
          bestCovered = covered;
        }
      }
      if (bestCovered.length < SPLIT_MIN_PIXELS) {
        break;
      }
      balls[r].push({ fill: best, pixels: bestCovered });
      const taken = new Set(bestCovered);
      remaining = remaining.filter((p) => !taken.has(p));
    }
  }
  // Reindex: parent rank keeps its slot, its balls follow immediately,
  // preserving the nested (rank >= r) paint order.
  const newRanks = new Int32Array(n).fill(-1);
  const newFills: Rgb[] = [];
  let idx = 0;
  for (let r = 0; r < nRanks; r += 1) {
    const inBall = new Set<number>();
    for (const b of balls[r]) {
      for (const p of b.pixels) {
        inBall.add(p);
      }
    }
    for (const p of layerPixels[r]) {
      if (!inBall.has(p)) {
        newRanks[p] = idx;
      }
    }
    newFills.push(fills[r]);
    idx += 1;
    for (const b of balls[r]) {
      for (const p of b.pixels) {
        newRanks[p] = idx;
      }
      newFills.push(b.fill);
      idx += 1;
    }
  }
  return { ranks: newRanks, fills: newFills };
}

/**
 * Trace each palette color as a nested binary mask (rank r covers its own
 * color plus every color painted above it) and merge the results into one
 * layered output painted background-first.
 *
 * When `originalPixels` (the pre-prep decoded image) is provided, each
 * layer's fill is recolored against the original via recolorPaletteFills;
 * otherwise the prepped palette colors are used as-is.
 */
/**
 * Build a residual correction layer (Claude feedback item 6).
 *
 * Compares the predicted raster (fills[splitRanks[p]]) against the original
 * RGBA pixels. Pixels that differ are grouped by exact RGBA color, and each
 * color gets one <path> with rectangle subpaths for runs of same-colored
 * pixels (scanned row by row). This achieves lossless output at 1:1.
 *
 * Returns the SVG path string, or null if no residual pixels.
 */
export function buildResidualLayer(
  originalPixels: Uint8ClampedArray,
  width: number,
  height: number,
  ranks: Int32Array,
  fills: Rgb[],
): string | null {
  // Group residual pixels by exact RGBA color
  const byColor = new Map<number, { x: number; y: number }[]>();
  const n = Math.min(
    Math.floor(originalPixels.length / 4),
    width * height,
    ranks.length,
  );

  for (let p = 0; p < n; p += 1) {
    const r = ranks[p];
    if (r < 0 || r >= fills.length) {
      // Unpainted pixel (e.g. transparent). If original is not transparent,
      // it's a residual.
      const o = p * 4;
      if (originalPixels[o + 3] !== 0) {
        const key =
          (originalPixels[o] << 24) |
          (originalPixels[o + 1] << 16) |
          (originalPixels[o + 2] << 8) |
          originalPixels[o + 3];
        if (!byColor.has(key)) {
          byColor.set(key, []);
        }
        byColor.get(key)!.push({ x: p % width, y: Math.floor(p / width) });
      }
      continue;
    }

    const [fr, fg, fb] = fills[r];
    const o = p * 4;
    const or = originalPixels[o];
    const og = originalPixels[o + 1];
    const ob = originalPixels[o + 2];
    const oa = originalPixels[o + 3];

    // Compare RGBA. For semi-transparent originals, we compare the
    // composited-over-white RGB (matching the metric) and alpha separately.
    let match: boolean;
    if (oa === 255) {
      match = or === fr && og === fg && ob === fb;
    } else if (oa === 0) {
      // Transparent original, but pixel was painted: residual only if
      // the fill is not white (white on transparent looks like background).
      // Actually, any painted pixel over transparent is wrong.
      match = false;
    } else {
      const af = oa / 255;
      const inv = 1 - af;
      const cr = Math.round(or * af + 255 * inv);
      const cg = Math.round(og * af + 255 * inv);
      const cb = Math.round(ob * af + 255 * inv);
      match = cr === fr && cg === fg && cb === fb;
    }

    if (!match) {
      const key = (or << 24) | (og << 16) | (ob << 8) | oa;
      if (!byColor.has(key)) {
        byColor.set(key, []);
      }
      byColor.get(key)!.push({ x: p % width, y: Math.floor(p / width) });
    }
  }

  if (byColor.size === 0) {
    return null;
  }

  // For each color, scan row by row and emit rectangle subpaths for runs
  const paths: string[] = [];
  for (const [key, pixels] of byColor) {
    const r = (key >> 24) & 0xff;
    const g = (key >> 16) & 0xff;
    const b = (key >> 8) & 0xff;
    const a = key & 0xff;

    // Sort by y then x for row scanning
    pixels.sort((p1, p2) => p1.y - p2.y || p1.x - p2.x);

    // Group into runs per row
    const subpaths: string[] = [];
    let i = 0;
    while (i < pixels.length) {
      const y = pixels[i].y;
      const x0 = pixels[i].x;
      let x1 = x0;
      i += 1;
      // Extend run while next pixel is on same row and adjacent
      while (
        i < pixels.length &&
        pixels[i].y === y &&
        pixels[i].x === x1 + 1
      ) {
        x1 = pixels[i].x;
        i += 1;
      }
      const w = x1 - x0 + 1;
      // Rectangle: M x y h w v1 h-w z
      subpaths.push(`M${x0} ${y}h${w}v1h${-w}z`);
    }

    const hex =
      "#" +
      [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    const opacity = a === 255 ? "" : ` fill-opacity="${(a / 255).toFixed(3)}"`;
    paths.push(
      `<path fill="${hex}"${opacity} d="${subpaths.join("")}"/>`,
    );
  }

  return paths.join("\n");
}

export function traceBinaryLayers(
  traceFn: WasmTraceFn,
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  tier: number,
  optionsJson: string,
  originalPixels?: Uint8ClampedArray | null,
  sourceWidth?: number,
  sourceHeight?: number,
): BinaryTraceOutput {
  const palette = topOpaquePalette(pixels, width, height, tier);
  const binaryOptionsJson = JSON.stringify({
    ...(JSON.parse(optionsJson) as Record<string, unknown>),
    clusteringMode: "binary",
  });
  const ranks =
    originalPixels != null
      ? paletteRanksOnOriginals(originalPixels, width, height, palette)
      : paletteRanks(pixels, width, height, palette);
  let splitRanks = ranks;
  let splitFills: Rgb[] =
    originalPixels != null
      ? recolorPaletteFills(originalPixels, width, height, palette, ranks)
      : palette;
  if (originalPixels != null) {
    // v1.0.32: carve heterogeneous ranks into sub-layers so blend ramps
    // get their own fills. Self-gating: ranks the recolor already covers
    // keep their exact pixels and fills.
    const split = splitSoupRanks(
      originalPixels,
      width,
      height,
      ranks,
      splitFills,
    );
    splitRanks = split.ranks;
    splitFills = split.fills;
  }
  const layers: VectorLayer[] = [];
  const svgParts: string[] = [];
  let nodeCount = 0;
  let pathCount = 0;
  for (let r = 0; r < splitFills.length; r += 1) {
    const bin = new Uint8Array(width * height * 4);
    for (let p = 0; p < splitRanks.length; p += 1) {
      const v = splitRanks[p] >= r ? 0 : 255;
      const o = p * 4;
      bin[o] = v;
      bin[o + 1] = v;
      bin[o + 2] = v;
      bin[o + 3] = 255;
    }
    const raw = traceFn(width, height, bin, binaryOptionsJson);
    const traced = JSON.parse(raw) as BinaryTraceOutput;
    if (traced.layers.length === 0) {
      continue;
    }
    const hex = rgbToHex(splitFills[r]);
    const name = `COLOR_${String(r + 1).padStart(2, "0")}`;
    for (const layer of traced.layers) {
      layers.push({ name, color: hex, paths: layer.paths });
    }
    svgParts.push(
      innerSvgPaths(traced.svg).replace(/fill="#[0-9A-Fa-f]{6}"/g, `fill="${hex}"`),
    );
    nodeCount += traced.metrics.nodeCount;
    pathCount += traced.metrics.pathCount;
  }
  // Residual correction layer (Claude feedback item 6): pixels where the
  // predicted raster (fills[splitRanks[p]]) differs from the original get
  // exact rectangle paths on top. With threshold 0 this is lossless at 1:1.
  if (originalPixels != null) {
    const residualSvg = buildResidualLayer(
      originalPixels,
      width,
      height,
      splitRanks,
      splitFills,
    );
    if (residualSvg) {
      svgParts.push(residualSvg);
      pathCount += 1;
    }
  }
  // Use source dimensions for display size (if provided), but keep viewBox
  // at the traced dimensions. This ensures images downscaled for tracing
  // still display at their original size (Claude feedback item 2).
  const displayWidth = sourceWidth ?? width;
  const displayHeight = sourceHeight ?? height;
  const svg =
    `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n` +
    `<svg width="${displayWidth}" height="${displayHeight}" viewBox="0 0 ${width} ${height}" version="1.1" xmlns="http://www.w3.org/2000/svg">\n` +
    `${svgParts.join("\n")}\n` +
    `</svg>\n`;
  return { width, height, layers, svg, metrics: { nodeCount, pathCount } };
}
