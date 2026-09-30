import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import { toVTracerOptions } from "@/lib/vectorize/vtracerOptions";
import { traceBinaryLayers } from "@/lib/vectorize/binaryLayers";
import { initSync, trace_rgba_to_json, trace_rgba_to_json_with_originals } from "@/public/vendor/vtracer/vtracer_wasm.js";

const wasmRaw = readFileSync(resolve(__dirname, "../public/vendor/vtracer/vtracer_wasm_bg.wasm"));
const wasmCopy = new Uint8Array(wasmRaw.length); wasmCopy.set(wasmRaw);
initSync({ module: wasmCopy.buffer });
const OPTIONS_JSON = JSON.stringify(toVTracerOptions(DEFAULT_SETTINGS));
type Img = { w: number; h: number; px: Uint8ClampedArray };

function render(svg: string, w: number, h: number, background: "white" | "black") {
  const r = new Resvg(svg, { background, fitTo: { mode: "width", value: w } }).render();
  expect([r.width, r.height]).toEqual([w, h]);   // size mismatch => ~0% everywhere
  return r.pixels;                                // raw RGBA, alpha 255 (opaque background)
}
function composite(img: Img, bg: number): Uint8Array {   // original as the browser shows it
  const out = new Uint8Array(img.px.length);
  for (let i = 0; i < img.px.length; i += 4) {
    const a = img.px[i + 3] / 255;
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(img.px[i + c] * a + bg * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}
function compare(rendered: Uint8Array, ref: Uint8Array) {  // RGB only
  let exact = 0, maxErr = 0, n = 0;
  for (let i = 0; i < ref.length; i += 4) {
    n++;
    const e = Math.max(Math.abs(rendered[i] - ref[i]), Math.abs(rendered[i + 1] - ref[i + 1]), Math.abs(rendered[i + 2] - ref[i + 2]));
    if (e === 0) exact++; if (e > maxErr) maxErr = e;
  }
  return { exactPct: (100 * exact) / n, maxErr };
}
const traceBinary = (img: Img, tier: number) => traceBinaryLayers(
  (w, h, p, j) => trace_rgba_to_json(w, h, p, j),
  img.w, img.h, img.px /* prepped = originals, prep skipped */, tier, OPTIONS_JSON,
  img.px /* originalPixels */, img.w, img.h /* sourceW/H = traced size */).svg;
const traceColor = (img: Img) => JSON.parse(trace_rgba_to_json_with_originals(
  img.w, img.h, new Uint8Array(img.px), new Uint8Array(img.px), OPTIONS_JSON)).svg as string;
function check(name: string, img: Img, svg: string) {
  return (["white", "black"] as const).map((bg) => {
    const r = compare(render(svg, img.w, img.h, bg), composite(img, bg === "white" ? 255 : 0));
    console.log(`${name} bg=${bg} exact ${r.exactPct.toFixed(3)}% max ${r.maxErr} svg ${(svg.length / 1024).toFixed(1)} KB`);
    return r;
  });
}

function make(w: number, h: number, f: (x: number, y: number) => number[]): Img {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(f(x, y).map(Math.round), (y * w + x) * 4);
  return { w, h, px };
}
const cov = (x: number, y: number, r: number) => Math.max(0, Math.min(1, r - Math.hypot(x + 0.5 - 24, y + 0.5 - 24) + 0.5));
const FIXTURES: Record<string, Img> = {
  "opaque AA disc": make(48, 48, (x, y) => { const c = cov(x, y, 16); return [220 * c + 255 * (1 - c), 30 * c + 255 * (1 - c), 30 * c + 255 * (1 - c), 255]; }),
  "soft-alpha disc on transparent": make(48, 48, (x, y) => [220, 30, 30, cov(x, y, 16) * 255]),
  "ring with transparent hole": make(48, 48, (x, y) => [30, 90, 200, cov(x, y, 18) * (1 - cov(x, y, 9)) * 255]),
  "horizontal gradient": make(64, 16, (x) => [(x / 63) * 255, 80, 160, 255]),
};
describe("pixel-perfect (resvg)", () => {
  for (const [name, img] of Object.entries(FIXTURES)) {
    it(`binary: ${name}`, () => { for (const r of check(`BIN ${name}`, img, traceBinary(img, 8))) expect(r.exactPct).toBe(100); });
    it(`color: ${name}`, () => { for (const r of check(`COL ${name}`, img, traceColor(img))) expect(r.exactPct).toBe(100); });
  }
});
