/**
 * Builds the sample images shown on the homepage (hero demo, "Try an
 * example", the "See the difference" gallery) from source PNGs, and traces
 * each one with the real converter pipeline so the shipped SVGs are exactly
 * what a visitor would get.
 *
 * Usage: npx tsx scripts/build-examples.ts <source-dir>
 * Reads <source-dir>/{logo,icon,illustration}.png, writes public/examples/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decode, encode } from "fast-png";
import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import { toVTracerOptions } from "@/lib/vectorize/vtracerOptions";
import { traceBinaryLayers } from "@/lib/vectorize/binaryLayers";
import { chooseTrace, pickSmallerPath } from "@/lib/vectorize/chooseTrace";
import { preprocessImageData } from "@/lib/image/preprocess";
import { boxDownscale } from "@/lib/image/downscale";
import { toRgba8 } from "@/lib/image/toRgba8";
import {
  initSync,
  trace_rgba_to_json,
  trace_rgba_to_json_with_originals,
} from "@/public/vendor/vtracer/vtracer_wasm.js";

const SOURCES: { name: string; out: string; maxSide: number }[] = [
  // Hero demo: small enough to load fast above the fold.
  { name: "logo", out: "hero-logo", maxSide: 480 },
  // "Try an example" and the gallery.
  { name: "logo", out: "logo", maxSide: 640 },
  { name: "icon", out: "icon", maxSide: 640 },
  { name: "illustration", out: "illustration", maxSide: 800 },
];

/**
 * Source cleanup for generated artwork. Image generators emit "opaque"
 * pixels at alpha 254 and add faint grain to flat fills; both would make the
 * sample SVGs huge (every pixel lands in the correction layer). Snap alpha
 * near 0/255 and snap grain to the image's dominant colors, leaving
 * anti-aliased edge blends untouched.
 */
function flattenArtwork(px: Uint8ClampedArray, maxColors = 10, tolerance = 28): void {
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] >= 245) px[i] = 255;
    else if (px[i] <= 10) px[i] = 0;
  }
  // Dominant colors from a 4-bit-per-channel histogram of opaque pixels.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] !== 255) continue;
    const key = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += px[i];
    bucket.g += px[i + 1];
    bucket.b += px[i + 2];
    buckets.set(key, bucket);
  }
  const palette = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, maxColors)
    .map((b) => [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)]);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    let best = -1;
    let bestDiff = Infinity;
    for (let k = 0; k < palette.length; k += 1) {
      const d = Math.max(
        Math.abs(px[i] - palette[k][0]),
        Math.abs(px[i + 1] - palette[k][1]),
        Math.abs(px[i + 2] - palette[k][2]),
      );
      if (d < bestDiff) {
        bestDiff = d;
        best = k;
      }
    }
    if (best >= 0 && bestDiff <= tolerance) {
      px[i] = palette[best][0];
      px[i + 1] = palette[best][1];
      px[i + 2] = palette[best][2];
    }
  }
}

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error("Usage: npx tsx scripts/build-examples.ts <source-dir>");
  process.exit(1);
}

const root = resolve(__dirname, "..");
const wasm = readFileSync(resolve(root, "public/vendor/vtracer/vtracer_wasm_bg.wasm"));
const wasmCopy = new Uint8Array(wasm.length);
wasmCopy.set(wasm);
initSync({ module: wasmCopy.buffer });

const outDir = resolve(root, "public/examples");
mkdirSync(outDir, { recursive: true });
const optionsJson = JSON.stringify(toVTracerOptions(DEFAULT_SETTINGS));

for (const { name, out, maxSide } of SOURCES) {
  const png = decode(readFileSync(resolve(sourceDir, `${name}.png`)));
  const full = toRgba8(png);
  const scale = Math.min(1, maxSide / Math.max(png.width, png.height));
  const w = Math.max(1, Math.round(png.width * scale));
  const h = Math.max(1, Math.round(png.height * scale));
  flattenArtwork(full);
  const px = scale < 1 ? boxDownscale(full, png.width, png.height, w, h) : full;
  // The downscale blends edges again; re-snap the interior grain it creates.
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] >= 245) px[i] = 255;
    else if (px[i] <= 10) px[i] = 0;
  }

  const pngBytes = encode({ width: w, height: h, data: new Uint8Array(px.buffer, px.byteOffset, px.byteLength), channels: 4, depth: 8 }, { zlib: { level: 9 } });
  writeFileSync(resolve(outDir, `${out}.png`), pngBytes);

  // Same routing as workers/vectorize.worker.ts.
  const pre = preprocessImageData(px, w, h);
  const routing = chooseTrace(pre.paletteTier, DEFAULT_SETTINGS.clusteringMode);
  const color = JSON.parse(
    trace_rgba_to_json_with_originals(w, h, new Uint8Array(pre.pixels), new Uint8Array(pre.originalPixels), optionsJson),
  ) as { svg: string; layers: unknown[]; metrics: { pixelExact?: string } };
  let svg = color.svg;
  let layers = color.layers.length;
  let pixelExact = color.metrics.pixelExact ?? "unknown";
  if (routing.paths.includes("binary") && pre.paletteTier != null) {
    const binary = traceBinaryLayers(
      (tw, th, tp, tj) => trace_rgba_to_json(tw, th, tp, tj),
      w, h, pre.pixels, pre.paletteTier, optionsJson, pre.originalPixels, w, h,
    );
    const pick = pickSmallerPath(
      { svgLength: binary.svg.length, pixelExact: binary.metrics.pixelExact },
      { svgLength: color.svg.length, pixelExact },
    );
    if (pick === "binary") {
      svg = binary.svg;
      layers = binary.layers.length;
      pixelExact = binary.metrics.pixelExact;
    }
  }
  writeFileSync(resolve(outDir, `${out}.svg`), svg);
  console.log(
    `${out}: ${w}x${h} png ${(pngBytes.length / 1024).toFixed(0)} KB, svg ${(svg.length / 1024).toFixed(0)} KB, ${layers} layers, ${pixelExact}`,
  );
}
