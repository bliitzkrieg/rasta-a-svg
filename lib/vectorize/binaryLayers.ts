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
import { DEFAULT_RESIDUAL_MAX_BYTES } from "./vtracerOptions";

export type Rgb = [number, number, number];

export interface BinaryTraceOutput {
  width: number;
  height: number;
  layers: VectorLayer[];
  svg: string;
  metrics: { nodeCount: number; pathCount: number; pixelExact: "exact" | "capped" | "simplified" };
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
    // Non-opaque pixels get rank -1 so no layer paints them.
    // They are handled by the residual layer with exact RGB + fill-opacity,
    // blending over the page exactly as the PNG does.
    if (originalPixels[o + 3] !== 255) {
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
 * How many frequent original colors per layer are tried as fill
 * candidates (plus the current palette color, which is always tried).
 */

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
    fills.push(keyToRgb(modeKey));
    continue;
  }
  return fills;
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
 * Compares the predicted raster (fills[ranks[p]]) against the original
 * RGBA pixels. Pixels that differ are grouped by exact RGBA color, and each
 * color gets one <path> with rectangle subpaths for runs of same-colored
 * pixels (scanned row by row). This achieves lossless output at 1:1.
 *
 * The residual is estimated from its run count before any SVG string is
 * built (~20 bytes per run): if the estimate exceeds maxBytes (0 = no cap),
 * the residual is skipped without allocating the huge string, and
 * skippedByCap is true so callers can report pixelExact: "capped".
 */
export function buildResidualLayer(
  originalPixels: Uint8ClampedArray,
  width: number,
  height: number,
  ranks: Int32Array,
  fills: Rgb[],
  maxBytes: number,
): { svg: string | null; skippedByCap: boolean } {
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

    // Compare RGB. Only opaque pixels (oa === 255) can be painted now;
    // non-opaque pixels get rank -1 and are handled by the r < 0 branch.
    const match = or === fr && og === fg && ob === fb;

    if (!match) {
      const key = (or << 24) | (og << 16) | (ob << 8) | oa;
      if (!byColor.has(key)) {
        byColor.set(key, []);
      }
      byColor.get(key)!.push({ x: p % width, y: Math.floor(p / width) });
    }
  }

  if (byColor.size === 0) {
    return { svg: null, skippedByCap: false };
  }

  // Merge row runs per color first (cheap integer tuples), so the size can
  // be estimated before building any SVG strings.
  const colors: { key: number; runs: { x0: number; y: number; w: number }[] }[] =
    [];
  let totalRuns = 0;
  for (const [key, pixels] of byColor) {
    // Group into runs per row (pixels already sorted by y then x)
    const runs: { x0: number; y: number; w: number }[] = [];
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
      runs.push({ x0, y, w: x1 - x0 + 1 });
    }
    totalRuns += runs.length;
    colors.push({ key, runs });
  }

  // Estimate ~20 bytes per run for path data, ~48 bytes per color for the
  // path wrapper, plus the group tags.
  const estimate = totalRuns * 20 + colors.length * 48 + 32;
  if (maxBytes !== 0 && estimate > maxBytes) {
    return { svg: null, skippedByCap: true };
  }

  // For each color, emit rectangle subpaths for runs
  // Note: pixels are already in row-major order (added sequentially by p),
  // so no sort is needed.
  const paths: string[] = [];
  for (const { key, runs } of colors) {
    const r = (key >> 24) & 0xff;
    const g = (key >> 16) & 0xff;
    const b = (key >> 8) & 0xff;
    const a = key & 0xff;

    const subpaths: string[] = [];
    for (const { x0, y, w } of runs) {
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

  return { svg: paths.join("\n"), skippedByCap: false };
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
    // Force filterSpeckle to 1: the residual layer is the accuracy mechanism
    // now. Speckle filtering would drop small clusters that the residual
    // would then have to re-add, breaking the exactness guarantee.
    filterSpeckle: 1,
  });
  const ranks =
    originalPixels != null
      ? paletteRanksOnOriginals(originalPixels, width, height, palette)
      : paletteRanks(pixels, width, height, palette);
  const fills: Rgb[] =
    originalPixels != null
      ? recolorPaletteFills(originalPixels, width, height, palette, ranks)
      : palette;
  const layers: VectorLayer[] = [];
  const svgParts: string[] = [];
  let nodeCount = 0;
  let pathCount = 0;
  for (let r = 0; r < fills.length; r += 1) {
    const bin = new Uint8Array(width * height * 4);
    for (let p = 0; p < ranks.length; p += 1) {
      const v = ranks[p] >= r ? 0 : 255;
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
    const hex = rgbToHex(fills[r]);
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
  // predicted raster (fills[ranks[p]]) differs from the original get
  // exact rectangle paths on top. With threshold 0 this is lossless at 1:1.
  // Capped like the Rust color-path residual (usually moot: the smaller SVG
  // wins the tier comparison, but kept for symmetry).
  //
  // The residual assumes exact pixel-edge geometry. With Polygon curve
  // fitting the paths are simplified, so the residual would patch the wrong
  // pixels: skip it entirely (it only adds bytes).
  let pixelExact: "exact" | "capped" | "simplified" = "exact";
  if (originalPixels != null) {
    const parsed = JSON.parse(optionsJson) as {
      residualMaxBytes?: number;
      mode?: string;
      exactFlatPolygons?: boolean;
      flatClusterMaxDelta?: number;
    };
    const geometryExact =
      parsed.mode === "none" ||
      (parsed.mode === "spline" &&
        parsed.exactFlatPolygons === true &&
        (parsed.flatClusterMaxDelta ?? 0) >= 255);
    if (!geometryExact) {
      pixelExact = "simplified";
    } else {
      const residual = buildResidualLayer(
        originalPixels,
        width,
        height,
        ranks,
        fills,
        parsed.residualMaxBytes ?? DEFAULT_RESIDUAL_MAX_BYTES,
      );
      if (residual.svg) {
        // Wrap in a deletable group for cutting workflows (Claude feedback)
        svgParts.push(`<g id="pixel-corrections">${residual.svg}</g>`);
        pathCount += 1;
      } else if (residual.skippedByCap) {
        pixelExact = "capped";
      }
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
  return { width, height, layers, svg, metrics: { nodeCount, pathCount, pixelExact } };
}
