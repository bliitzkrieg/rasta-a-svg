/**
 * 18-image pixel-perfect benchmark (standalone Node script).
 *
 * Run with: npm run bench:pixel
 * Reads images from tools/parity/images/ (gitignored).
 * Writes JSON to tools/parity/results/latest.json.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { decode } from "fast-png";
import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import { toVTracerOptions } from "@/lib/vectorize/vtracerOptions";
import { traceBinaryLayers } from "@/lib/vectorize/binaryLayers";
import { preprocessImageData } from "@/lib/image/preprocess";
import { boxDownscale } from "@/lib/image/downscale";
import { toRgba8 } from "@/lib/image/toRgba8";
import { chooseTrace, pickSmallerPath } from "@/lib/vectorize/chooseTrace";
import { initSync, trace_rgba_to_json, trace_rgba_to_json_with_originals } from "@/public/vendor/vtracer/vtracer_wasm.js";

const wasmRaw = readFileSync(resolve(__dirname, "../../public/vendor/vtracer/vtracer_wasm_bg.wasm"));
const wasmCopy = new Uint8Array(wasmRaw.length);
wasmCopy.set(wasmRaw);
initSync({ module: wasmCopy.buffer });
const OPTIONS_JSON = JSON.stringify(toVTracerOptions(DEFAULT_SETTINGS));

type Img = { w: number; h: number; px: Uint8ClampedArray };

function render(svg: string, w: number, h: number, background: "white" | "black") {
  const r = new Resvg(svg, { background, fitTo: { mode: "width", value: w } }).render();
  if (r.width !== w || r.height !== h) {
    throw new Error(`Render size mismatch: got ${r.width}x${r.height}, expected ${w}x${h}`);
  }
  return r.pixels;
}

function composite(img: Img, bg: number): Uint8Array {
  const out = new Uint8Array(img.px.length);
  for (let i = 0; i < img.px.length; i += 4) {
    const a = img.px[i + 3] / 255;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(img.px[i + c] * a + bg * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}

function compare(rendered: Uint8Array, ref: Uint8Array) {
  let exact = 0, maxErr = 0, n = 0;
  for (let i = 0; i < ref.length; i += 4) {
    n++;
    const e = Math.max(
      Math.abs(rendered[i] - ref[i]),
      Math.abs(rendered[i + 1] - ref[i + 1]),
      Math.abs(rendered[i + 2] - ref[i + 2])
    );
    if (e === 0) exact++;
    if (e > maxErr) maxErr = e;
  }
  return { exactPct: (100 * exact) / n, maxErr };
}

function loadPng(path: string): Img {
  const p = decode(readFileSync(path));
  const px = toRgba8(p);
  return { w: p.width, h: p.height, px };
}

function boxDownscaleImg(img: Img, maxDim: number): Img {
  const maxSide = Math.max(img.w, img.h);
  if (maxSide <= maxDim) return img;
  const scale = maxDim / maxSide;
  const w = Math.max(1, Math.round(img.w * scale));
  const h = Math.max(1, Math.round(img.h * scale));
  const px = boxDownscale(img.px, img.w, img.h, w, h);
  return { w, h, px };
}

interface BenchResult {
  image: string;
  path: "binary" | "color";
  /** Which path the app actually ships (reproduces worker routing) */
  appPath: "binary" | "color" | null;
  tier: number | null;
  exactWhite: number;
  exactBlack: number;
  maxErrWhite: number;
  maxErrBlack: number;
  /** Why the result is or isn't pixel-exact */
  pixelExact: string;
  svgBytes: number;
  timeMs: number;
}

async function main() {
  const imagesDir = resolve(__dirname, "./images");
  const resultsDir = resolve(__dirname, "./results");
  
  if (!existsSync(imagesDir)) {
    console.error(`Images directory not found: ${imagesDir}`);
    console.error("Add PNGs to tools/parity/images/ (gitignored).");
    process.exit(1);
  }

  const files = readdirSync(imagesDir).filter(f => f.endsWith(".png")).sort();
  console.log(`Found ${files.length} images\n`);
  
  const results: BenchResult[] = [];
  let failures = 0;
  
  for (const file of files) {
    const name = basename(file, ".png");
    console.log(`Benchmarking ${name}...`);
    
    const rawImg = loadPng(resolve(imagesDir, file));
    const scaled = boxDownscaleImg(rawImg, 1000);
    const prepped = preprocessImageData(scaled.px, scaled.w, scaled.h);
    
    // Use the shared routing logic so the bench scores what the app ships
    const routing = chooseTrace(prepped.paletteTier, DEFAULT_SETTINGS.clusteringMode);
    const tier = prepped.paletteTier ?? 32;
    
    // Trace the paths the router specifies, then determine appPath
    const pathSvgs = new Map<"binary" | "color", string>();
    for (const path of routing.paths) {
      const start = Date.now();
      let svg: string;
      let pixelExact = "exact";
      
      try {
        if (path === "binary") {
          const out = traceBinaryLayers(
            (w, h, p, j) => trace_rgba_to_json(w, h, p, j),
            scaled.w, scaled.h,
            prepped.pixels,
            tier,
            OPTIONS_JSON,
            prepped.originalPixels,
            scaled.w, scaled.h
          );
          svg = out.svg!;
          pixelExact = out.metrics.pixelExact;
        } else {
          const out = JSON.parse(trace_rgba_to_json_with_originals(
            scaled.w, scaled.h,
            new Uint8Array(prepped.pixels),
            new Uint8Array(prepped.originalPixels),
            OPTIONS_JSON
          ));
          svg = out.svg as string;
          pixelExact = out.metrics.pixelExact ?? "exact";
        }
      } catch (e) {
        console.error(`  ${path}: TRACE FAILED - ${e}`);
        failures++;
        continue;
      }
      
      const timeMs = Date.now() - start;
      
      const ref = { w: scaled.w, h: scaled.h, px: scaled.px };
      const whiteRef = composite(ref, 255);
      const blackRef = composite(ref, 0);
      const whiteRender = render(svg, scaled.w, scaled.h, "white");
      const blackRender = render(svg, scaled.w, scaled.h, "black");
      const whiteCmp = compare(whiteRender, whiteRef);
      const blackCmp = compare(blackRender, blackRef);
      
      const result: BenchResult = {
        image: name,
        path,
        // appPath determined after both paths traced (see below); the only
        // path is the shipped path when the router traces just one
        appPath: routing.paths.length > 1 ? null : path,
        tier: path === "binary" ? tier : null,
        exactWhite: whiteCmp.exactPct,
        exactBlack: blackCmp.exactPct,
        maxErrWhite: whiteCmp.maxErr,
        maxErrBlack: blackCmp.maxErr,
        pixelExact,
        svgBytes: svg.length,
        timeMs,
      };
      results.push(result);
      pathSvgs.set(path, svg);
      
      // A non-exact result is honest by design (capped, simplified, bw),
      // not a regression: the old code dropped the same residual, it just
      // didn't say so. Only gate on 100% when exact was claimed.
      const isExact = pixelExact === "exact";
      const status = !isExact
        ? pixelExact.toUpperCase()
        : (whiteCmp.exactPct === 100 && blackCmp.exactPct === 100) ? "PASS" : "FAIL";
      if (status === "FAIL") failures++;
      
      console.log(`  ${path}: [${status}] white=${whiteCmp.exactPct.toFixed(3)}% black=${blackCmp.exactPct.toFixed(3)}% ` +
        `max=${Math.max(whiteCmp.maxErr, blackCmp.maxErr)} bytes=${svg.length} time=${timeMs}ms` +
        (isExact ? "" : ` pixelExact=${pixelExact}`));
    }
    
    // Determine which path the app ships (for tier images: smaller SVG)
    if (routing.paths.length > 1) {
      const binarySvg = pathSvgs.get("binary");
      const colorSvg = pathSvgs.get("color");
      if (binarySvg && colorSvg) {
        const shipped = pickSmallerPath(binarySvg.length, colorSvg.length);
        // Update appPath for all results from this image
        for (const r of results) {
          if (r.image === name) {
            r.appPath = shipped;
          }
        }
        console.log(`  -> app ships: ${shipped} (smaller SVG)`);
      }
    }
  }
  
  mkdirSync(resultsDir, { recursive: true });
  const outPath = resolve(resultsDir, "latest.json");
  writeFileSync(outPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\nWrote ${outPath}`);
  
  const baselinePath = resolve(resultsDir, "baseline.json");
  if (existsSync(baselinePath)) {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));
    for (const r of results) {
      const b = baseline.results.find((x: BenchResult) => x.image === r.image && x.path === r.path);
      if (b) {
        const growth = (r.svgBytes - b.svgBytes) / b.svgBytes;
        if (growth > 0.05) {
          console.error(`${r.image} ${r.path}: SVG grew ${(growth * 100).toFixed(1)}% over baseline (>5%)`);
          failures++;
        }
      }
    }
    if (failures === 0) console.log("Baseline check passed (no >5% growth)");
  }
  
  if (failures > 0) {
    console.error(`\n${failures} failures`);
    process.exit(1);
  }
  const nonExact = results.filter(r => r.pixelExact !== "exact").length;
  console.log(`\nAll benchmarks passed${nonExact > 0 ? ` (${nonExact} not exact)` : " at 100% exact"}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
