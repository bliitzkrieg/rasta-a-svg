/**
 * Cut-file tracing for Cricut Design Space, Silhouette and other cutters.
 *
 * The pixel-perfect pipeline is the wrong shape for a cutting machine: it
 * keeps every anti-aliased shade as its own color (dozens of mats), follows
 * pixel staircases, and adds thousands of 1px correction rectangles, while
 * Design Space rejects any SVG with more than 5,000 paths. A cut file wants
 * the opposite:
 *
 * - a handful of flat colors (one layer and one mat per color),
 * - no background shape,
 * - smooth curves the blade can follow,
 * - no specks or pinholes too small to cut or weed,
 * - one compound path per color, so each color imports as a single layer,
 * - a real physical size.
 *
 * The image is reduced to a small palette, each color becomes a binary mask
 * (stacked: holes covered by colors above are filled in, so every layer
 * sits on a solid base), each mask is cleaned of tiny pieces and traced
 * with smooth curves, and the result is written as a minimal SVG.
 */
import type { ConversionSettings, VectorLayer, VectorPath } from "@/types/vector";
import { rgbToHex, type Rgb, type WasmTraceFn } from "./binaryLayers";

/** Most colors a cut file gets in auto mode (Cricut's own tool caps at 9). */
export const CUT_MAX_COLORS = 8;
/** Colors covering less than this share of the artwork are merged away (auto). */
const MIN_COLOR_SHARE = 0.004;
/** Colors closer than this (RGB distance) are treated as one color (auto). */
const MERGE_DISTANCE = 32;
/** Largest physical size written to the file. Design Space shrinks anything
 * over 12" to 12", and a 12" x 12" mat needs a small margin. */
export const CUT_MAX_INCHES = 11.5;
/** Pixels per inch used to give the source image a physical size. */
const CSS_DPI = 96;
/** Transparent pixels allowed before the image counts as having no background. */
const TRANSPARENT_SHARE_FOR_KEYED = 0.02;
/** Share of the border one color must own to be treated as the background. */
const BACKGROUND_BORDER_SHARE = 0.6;
/** Neighbors within this (per channel) of a pixel count as the same color. */
const INTERIOR_TOLERANCE = 24;

export interface CutPalette {
  palette: Rgb[];
  /** Palette index per pixel, -1 for transparent / removed background. */
  labels: Int16Array;
  backgroundRemoved: boolean;
}

function dist2(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  // Weighted toward green like human vision, so shades merge sensibly.
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

function luminance([r, g, b]: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function nearest(color: Rgb, palette: Rgb[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let k = 0; k < palette.length; k += 1) {
    const d = dist2(color, palette[k]);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}

interface ColorBucket {
  n: number;
  rgb: Rgb;
}

/** Histogram (5 bits per channel) of the pixels `keep` accepts, most common first. */
function colorHistogram(
  pixels: Uint8ClampedArray,
  total: number,
  keep: (i: number) => boolean,
): { entries: ColorBucket[]; count: number } {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let count = 0;
  for (let i = 0; i < total; i += 1) {
    if (!keep(i)) continue;
    const o = i * 4;
    count += 1;
    const key = ((pixels[o] >> 3) << 10) | ((pixels[o + 1] >> 3) << 5) | (pixels[o + 2] >> 3);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += pixels[o];
    bucket.g += pixels[o + 1];
    bucket.b += pixels[o + 2];
    buckets.set(key, bucket);
  }
  const entries = [...buckets.values()]
    .map((b) => ({ n: b.n, rgb: [b.r / b.n, b.g / b.n, b.b / b.n] as Rgb }))
    .sort((a, b) => b.n - a.n);
  return { entries, count };
}

/**
 * Greedy pick of dominant, clearly different colors, then a few k-means
 * rounds to center each on its pixels. Colors below `minShare` of the
 * pixels are not worth their own mat (anti-aliasing, grain, JPEG noise).
 */
function pickPalette(entries: ColorBucket[], count: number, limit: number, minShare: number): Rgb[] {
  const minCount = count * minShare;
  const mergeDist2 = MERGE_DISTANCE * MERGE_DISTANCE * 9;
  let palette: Rgb[] = [];
  for (const entry of entries) {
    if (palette.length >= limit || entry.n < minCount) break;
    if (palette.some((p) => dist2(p, entry.rgb) < mergeDist2)) continue;
    palette.push(entry.rgb);
  }
  if (palette.length === 0) palette = [entries[0].rgb];
  // A single color stays the dominant color: an average would be a blend
  // of everything (black text and a pink heart would cut in dark rose).
  if (palette.length > 1) {
    for (let iter = 0; iter < 6; iter += 1) {
      const sums = palette.map(() => [0, 0, 0, 0]);
      for (const entry of entries) {
        const k = nearest(entry.rgb, palette);
        sums[k][0] += entry.rgb[0] * entry.n;
        sums[k][1] += entry.rgb[1] * entry.n;
        sums[k][2] += entry.rgb[2] * entry.n;
        sums[k][3] += entry.n;
      }
      palette = palette.map((p, k) =>
        sums[k][3] > 0 ? [sums[k][0] / sums[k][3], sums[k][1] / sums[k][3], sums[k][2] / sums[k][3]] : p,
      );
    }
  }
  return palette.map((p) => p.map((v) => Math.round(v)) as Rgb);
}

/** Labels every pixel `keep` accepts with its nearest palette color. */
function assignLabels(
  pixels: Uint8ClampedArray,
  labels: Int16Array,
  palette: Rgb[],
  keep: (i: number) => boolean,
): void {
  const cache = new Map<number, number>();
  for (let i = 0; i < labels.length; i += 1) {
    if (!keep(i)) {
      labels[i] = -1;
      continue;
    }
    const o = i * 4;
    const key = (pixels[o] << 16) | (pixels[o + 1] << 8) | pixels[o + 2];
    let k = cache.get(key);
    if (k === undefined) {
      k = nearest([pixels[o], pixels[o + 1], pixels[o + 2]], palette);
      cache.set(key, k);
    }
    labels[i] = k;
  }
}

/** The label that owns most of the image border, or -1. */
function borderColor(labels: Int16Array, width: number, height: number): number {
  const counts = new Map<number, number>();
  let border = 0;
  const visit = (i: number) => {
    border += 1;
    if (labels[i] >= 0) counts.set(labels[i], (counts.get(labels[i]) ?? 0) + 1);
  };
  for (let x = 0; x < width; x += 1) {
    visit(x);
    if (height > 1) visit((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    visit(y * width);
    if (width > 1) visit(y * width + width - 1);
  }
  const [label, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [-1, 0];
  return count >= border * BACKGROUND_BORDER_SHARE ? label : -1;
}

/**
 * True for pixels inside a flat region: opaque, with all four neighbors
 * (where they exist) opaque and close in color. Anti-aliased edges, the
 * main source of stray shades, are thin bands whose neighbors differ
 * strongly, so they never count; grain and JPEG noise stay within the
 * tolerance, so noisy flat fills still do.
 */
function interiorMask(pixels: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const close = (a: number, b: number) =>
    pixels[b * 4 + 3] >= 128 &&
    Math.abs(pixels[a * 4] - pixels[b * 4]) <= INTERIOR_TOLERANCE &&
    Math.abs(pixels[a * 4 + 1] - pixels[b * 4 + 1]) <= INTERIOR_TOLERANCE &&
    Math.abs(pixels[a * 4 + 2] - pixels[b * 4 + 2]) <= INTERIOR_TOLERANCE;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (pixels[i * 4 + 3] < 128) continue;
      if (x > 0 && !close(i, i - 1)) continue;
      if (x < width - 1 && !close(i, i + 1)) continue;
      if (y > 0 && !close(i, i - width)) continue;
      if (y < height - 1 && !close(i, i + width)) continue;
      mask[i] = 1;
    }
  }
  return mask;
}

/**
 * Reduces the image to a few flat colors and removes a solid background.
 * `maxColors` 0 picks the number of colors automatically (up to 8).
 *
 * Colors are chosen from flat-region pixels only (see interiorMask), then
 * every pixel, edges included, takes its nearest chosen color.
 */
export function buildCutPalette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  maxColors: number,
): CutPalette {
  const total = width * height;
  const labels = new Int16Array(total).fill(-1);
  const opaque = (i: number) => pixels[i * 4 + 3] >= 128;
  let opaqueCount = 0;
  for (let i = 0; i < total; i += 1) if (opaque(i)) opaqueCount += 1;
  if (opaqueCount === 0) return { palette: [], labels, backgroundRemoved: false };
  const interior = interiorMask(pixels, width, height);
  // Pure hairline art has no flat interior; then every pixel votes.
  const sample = (keep: (i: number) => boolean) => {
    const flat = colorHistogram(pixels, total, (i) => interior[i] === 1 && keep(i));
    return flat.count > 0 ? flat : colorHistogram(pixels, total, keep);
  };
  const all = sample(opaque);

  // A solid background (a photo of a sticker, a quote on white) is not part
  // of the design. When the image has no transparency and one color owns
  // most of the border, that color is removed everywhere, so letter
  // counters and other enclosed background areas become holes too. A fine
  // palette is used to find it, so even small lettering on a big white
  // page counts as a separate color.
  const fine = pickPalette(all.entries, all.count, CUT_MAX_COLORS, MIN_COLOR_SHARE / 8);
  assignLabels(pixels, labels, fine, opaque);
  const background =
    fine.length > 1 && total - opaqueCount <= total * TRANSPARENT_SHARE_FOR_KEYED
      ? borderColor(labels, width, height)
      : -1;
  const keep =
    background >= 0
      ? (() => {
          const removed = new Uint8Array(total);
          for (let i = 0; i < total; i += 1) if (labels[i] === background) removed[i] = 1;
          return (i: number) => opaque(i) && removed[i] === 0;
        })()
      : opaque;
  const design = background >= 0 ? sample(keep) : all;
  if (design.count === 0) {
    labels.fill(-1);
    return { palette: [], labels, backgroundRemoved: true };
  }

  // The cut colors come from the design alone. An explicit count keeps
  // every distinct color up to that number; auto drops minor shades.
  const auto = pickPalette(design.entries, design.count, CUT_MAX_COLORS, MIN_COLOR_SHARE);
  const palette =
    maxColors === 1
      ? // A one-color silhouette takes the design's darkest color.
        [auto.reduce((a, b) => (luminance(b) < luminance(a) ? b : a))]
      : maxColors > 0
        ? pickPalette(design.entries, design.count, Math.min(maxColors, CUT_MAX_COLORS), 0)
        : auto;
  // Every kept pixel takes its nearest palette color: anti-aliased edges
  // snap to one side, which is exactly where a blade should cut.
  assignLabels(pixels, labels, palette, keep);
  return { palette, labels, backgroundRemoved: background >= 0 };
}

/**
 * Connected components (4-connected) of the pixels where `inside` is true.
 * Calls `visit` with each component's pixel indices and whether it touches
 * the image border.
 */
function forEachComponent(
  inside: (i: number) => boolean,
  width: number,
  height: number,
  visit: (pixels: number[], touchesBorder: boolean) => void,
): void {
  const total = width * height;
  const seen = new Uint8Array(total);
  const stack: number[] = [];
  for (let start = 0; start < total; start += 1) {
    if (seen[start] || !inside(start)) continue;
    const component: number[] = [];
    let touchesBorder = false;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      component.push(i);
      const x = i % width;
      const y = (i - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      if (x > 0 && !seen[i - 1] && inside(i - 1)) {
        seen[i - 1] = 1;
        stack.push(i - 1);
      }
      if (x < width - 1 && !seen[i + 1] && inside(i + 1)) {
        seen[i + 1] = 1;
        stack.push(i + 1);
      }
      if (y > 0 && !seen[i - width] && inside(i - width)) {
        seen[i - width] = 1;
        stack.push(i - width);
      }
      if (y < height - 1 && !seen[i + width] && inside(i + width)) {
        seen[i + width] = 1;
        stack.push(i + width);
      }
    }
    visit(component, touchesBorder);
  }
}

export interface CutLayerMask {
  color: Rgb;
  mask: Uint8Array;
}

/**
 * One mask per palette color, bottom layer first.
 *
 * Colors are stacked largest-first. In stacked mode each layer's holes are
 * filled wherever the hole holds only colors that sit above it, so upper
 * layers rest on a solid base (Cricut's "stacked" layering, best for vinyl,
 * HTV and paper). Every pixel still shows its own color, because a layer
 * only grows under colors stacked on top of it. Sliced mode leaves each
 * color exactly where it is (no overlap, best for Infusible Ink).
 *
 * Pieces and holes smaller than `minArea` pixels are removed: they are too
 * small to cut or weed.
 */
export function cutLayerMasks(
  { palette, labels }: CutPalette,
  width: number,
  height: number,
  stacked: boolean,
  minArea: number,
): CutLayerMask[] {
  const total = width * height;
  const areas = palette.map(() => 0);
  for (let i = 0; i < total; i += 1) if (labels[i] >= 0) areas[labels[i]] += 1;
  const order = palette.map((_, k) => k).filter((k) => areas[k] > 0).sort((a, b) => areas[b] - areas[a]);
  const rank = new Int16Array(palette.length).fill(-1);
  order.forEach((k, r) => {
    rank[k] = r;
  });

  const layers: CutLayerMask[] = [];
  for (let r = 0; r < order.length; r += 1) {
    const k = order[r];
    const mask = new Uint8Array(total);
    for (let i = 0; i < total; i += 1) if (labels[i] === k) mask[i] = 1;

    // Drop specks.
    forEachComponent((i) => mask[i] === 1, width, height, (pixels) => {
      if (pixels.length < minArea) for (const i of pixels) mask[i] = 0;
    });

    // Fill holes: pinholes always, and (stacked) any hole holding only
    // colors that sit above this layer.
    forEachComponent((i) => mask[i] === 0, width, height, (pixels, touchesBorder) => {
      if (touchesBorder) return;
      const fill =
        pixels.length < minArea ||
        (stacked && pixels.every((i) => labels[i] >= 0 && rank[labels[i]] > r));
      if (fill) for (const i of pixels) mask[i] = 1;
    });

    if (mask.some((v) => v === 1)) layers.push({ color: palette[k], mask });
  }
  return layers;
}

interface TracedCutLayer {
  color: string;
  /** Path data with absolute coordinates in traced pixels. */
  d: string;
  paths: VectorPath[];
}

/** Tracer options for smooth, cuttable outlines of a binary mask. */
function cutTraceOptions(settings: ConversionSettings): string {
  return JSON.stringify({
    clusteringMode: "binary",
    hierarchical: "stacked",
    colorPrecision: 8,
    // Specks are already removed on the mask, at the cut file's own size.
    filterSpeckle: 0,
    layerDifference: 1,
    cornerThreshold: 60,
    lengthThreshold: 4,
    maxIterations: 10,
    pathPrecision: Math.max(1, Math.min(3, Math.round(settings.pathPrecision))),
    spliceThreshold: 45,
    mode: "spline",
    polygonMaxArea: 0,
    exactFlatPolygons: false,
    residualMaxBytes: 0,
  });
}

/** Shifts every coordinate of absolute M/L/C/Z path data by (dx, dy). */
export function translatePathData(d: string, dx: number, dy: number): string {
  let index = 0;
  return d.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (match) => {
    const value = Number(match) + (index % 2 === 0 ? dx : dy);
    index += 1;
    return String(Math.round(value * 100) / 100);
  });
}

function traceMask(
  trace: WasmTraceFn,
  mask: Uint8Array,
  width: number,
  height: number,
  optionsJson: string,
): { d: string; paths: VectorPath[] } {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    const v = mask[i] ? 0 : 255;
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  const out = JSON.parse(trace(width, height, rgba, optionsJson)) as {
    svg: string;
    layers: VectorLayer[];
  };
  const parts: string[] = [];
  for (const match of out.svg.matchAll(/<path\b[^>]*>/g)) {
    const tag = match[0];
    const d = /\bd="([^"]*)"/.exec(tag)?.[1];
    if (!d) continue;
    const t = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(tag);
    parts.push(translatePathData(d.trim(), t ? Number(t[1]) : 0, t ? Number(t[2]) : 0));
  }
  return {
    d: parts.join(" "),
    paths: out.layers.flatMap((layer) => layer.paths),
  };
}

export interface CutFileResult {
  svg: string;
  /** The same paths framed like the whole source image, for the compare
   * preview (the downloaded file is cropped to the artwork). */
  previewSvg: string;
  layers: VectorLayer[];
  nodeCount: number;
  pathCount: number;
  backgroundRemoved: boolean;
}

/** Physical size for the artwork box: source pixels at 96 DPI, capped to fit a mat. */
export function cutFileInches(boxWidthSourcePx: number, boxHeightSourcePx: number): { width: number; height: number } {
  let width = boxWidthSourcePx / CSS_DPI;
  let height = boxHeightSourcePx / CSS_DPI;
  const longSide = Math.max(width, height);
  if (longSide > CUT_MAX_INCHES) {
    width *= CUT_MAX_INCHES / longSide;
    height *= CUT_MAX_INCHES / longSide;
  }
  return { width, height };
}

/**
 * Traces `pixels` (raw RGBA, traced size) into a cut-ready SVG.
 * `sourceWidth`/`sourceHeight` are the uploaded image's size, used for the
 * physical size of the file.
 */
export function traceCutFile(
  trace: WasmTraceFn,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  settings: ConversionSettings,
  sourceWidth = width,
  sourceHeight = height,
): CutFileResult {
  const palette = buildCutPalette(pixels, width, height, settings.cutColors);
  const speck = Math.max(1, Math.round(settings.filterSpeckle));
  const masks = cutLayerMasks(palette, width, height, settings.hierarchical !== "cutout", speck * speck);
  const optionsJson = cutTraceOptions(settings);

  const traced: TracedCutLayer[] = masks
    .map(({ color, mask }) => ({ color: rgbToHex(color), ...traceMask(trace, mask, width, height, optionsJson) }))
    .filter((layer) => layer.d.length > 0);

  // Crop to the artwork so the physical size is the design's size.
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (const { mask } of masks) {
    for (let i = 0; i < mask.length; i += 1) {
      if (!mask[i]) continue;
      const x = i % width;
      const y = (i - x) / width;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + 1 > maxX) maxX = x + 1;
      if (y + 1 > maxY) maxY = y + 1;
    }
  }
  if (maxX <= minX || maxY <= minY) {
    minX = 0;
    minY = 0;
    maxX = width;
    maxY = height;
  }
  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const inches = cutFileInches((boxW * sourceWidth) / width, (boxH * sourceHeight) / height);

  const body = traced
    .map(
      (layer, index) =>
        `<path id="layer-${index + 1}" fill="${layer.color}" d="${translatePathData(layer.d, -minX, -minY)}"/>`,
    )
    .join("\n");
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${inches.width.toFixed(3)}in" height="${inches.height.toFixed(3)}in" viewBox="0 0 ${boxW} ${boxH}">\n` +
    `${body}\n</svg>\n`;
  // The compare preview overlays the SVG on the original image, so it needs
  // the original's frame rather than the crop.
  const previewSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sourceWidth}" height="${sourceHeight}" viewBox="0 0 ${width} ${height}">` +
    traced.map((layer) => `<path fill="${layer.color}" d="${layer.d}"/>`).join("") +
    `</svg>`;

  const layers: VectorLayer[] = traced.map((layer, index) => ({
    name: `LAYER_${index + 1}`,
    color: layer.color,
    paths: layer.paths,
  }));
  return {
    svg,
    previewSvg,
    layers,
    // Anchor points the blade visits: one per path command.
    nodeCount: (body.match(/[MLC]/g) ?? []).length,
    pathCount: traced.length,
    backgroundRemoved: palette.backgroundRemoved,
  };
}
