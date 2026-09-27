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
 * For each pixel, its palette rank (0 = most common), or -1 when the pixel
 * is not opaque or its color is outside the palette.
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
    if (pixels[o + 3] !== 255) {
      continue;
    }
    ranks[p] = index.get(rgbKey(pixels[o], pixels[o + 1], pixels[o + 2])) ?? -1;
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
 * Trace each palette color as a nested binary mask (rank r covers its own
 * color plus every color painted above it) and merge the results into one
 * layered output painted background-first.
 */
export function traceBinaryLayers(
  traceFn: WasmTraceFn,
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  tier: number,
  optionsJson: string,
): BinaryTraceOutput {
  const palette = topOpaquePalette(pixels, width, height, tier);
  const binaryOptionsJson = JSON.stringify({
    ...(JSON.parse(optionsJson) as Record<string, unknown>),
    clusteringMode: "binary",
  });
  const ranks = paletteRanks(pixels, width, height, palette);
  const layers: VectorLayer[] = [];
  const svgParts: string[] = [];
  let nodeCount = 0;
  let pathCount = 0;
  for (let r = 0; r < palette.length; r += 1) {
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
    const hex = rgbToHex(palette[r]);
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
  const svg =
    `<?xml version="1.0" encoding="UTF-8" ?>\n` +
    `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n` +
    `<svg width="${width}pt" height="${height}pt" viewBox="0 0 ${width} ${height}" version="1.1" xmlns="http://www.w3.org/2000/svg">\n` +
    `${svgParts.join("\n")}\n` +
    `</svg>\n`;
  return { width, height, layers, svg, metrics: { nodeCount, pathCount } };
}
