import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import { toVTracerOptions } from "@/lib/vectorize/vtracerOptions";
import {
  initSync,
  trace_rgba_to_json,
  trace_rgba_to_json_with_originals,
} from "@/public/vendor/vtracer/vtracer_wasm.js";

// Cold-start flake: the WASM initSync runs at module load time, outside any
// test timeout (Claude review). Moving it into beforeAll puts it under
// hookTimeout instead of failing the whole file silently on a slow load.
vi.setConfig({ testTimeout: 20_000, hookTimeout: 30_000 });

const wasmBytes: ArrayBuffer = (() => {
  const raw = readFileSync(
    resolve(__dirname, "../public/vendor/vtracer/vtracer_wasm_bg.wasm"),
  );
  const copy = new Uint8Array(raw.length);
  copy.set(raw);
  return copy.buffer as ArrayBuffer;
})();

beforeAll(() => {
  initSync({ module: wasmBytes });
});

interface TracePoint {
  x: number;
  y: number;
}

interface TracePath {
  points: TracePoint[];
}

interface TraceLayer {
  name: string;
  color: string;
  paths: TracePath[];
}

interface TraceOutput {
  width: number;
  height: number;
  layers: TraceLayer[];
  svg: string;
  metrics: { nodeCount: number; pathCount: number };
}

function trace(
  width: number,
  height: number,
  pixels: Uint8Array,
  options: Record<string, unknown>,
): TraceOutput {
  return JSON.parse(
    trace_rgba_to_json(width, height, pixels, JSON.stringify(options)),
  ) as TraceOutput;
}

function defaultOptions(): Record<string, unknown> {
  return toVTracerOptions(DEFAULT_SETTINGS) as unknown as Record<
    string,
    unknown
  >;
}

/** 120x120 "logo": white background, red circle, blue square. */
function logoPixels(): { width: number; height: number; pixels: Uint8Array } {
  const width = 120;
  const height = 120;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = 255;
      const dx = x - 40;
      const dy = y - 40;
      if (dx * dx + dy * dy < 25 * 25) {
        pixels[i] = 220;
        pixels[i + 1] = 30;
        pixels[i + 2] = 30;
      }
      if (x > 70 && x < 105 && y > 70 && y < 105) {
        pixels[i] = 30;
        pixels[i + 1] = 80;
        pixels[i + 2] = 220;
      }
    }
  }
  return { width, height, pixels };
}

/** Deterministic color noise: every cluster has wide color variation, so the
 * default mode's polygon simplify compacts it while pixel mode exact-walks. */
function noisyPixels(): { width: number; height: number; pixels: Uint8Array } {
  const width = 120;
  const height = 120;
  const pixels = new Uint8Array(width * height * 4);
  let seed = 123456789;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    pixels[o] = Math.floor(rand() * 256);
    pixels[o + 1] = Math.floor(rand() * 256);
    pixels[o + 2] = Math.floor(rand() * 256);
    pixels[o + 3] = 255;
  }
  return { width, height, pixels };
}

/** Soft radial pink gradient on cream: mimics illustration-style shading. */
function softPinkBlob(): { width: number; height: number; pixels: Uint8Array } {
  const width = 200;
  const height = 200;
  const pixels = new Uint8Array(width * height * 4);
  const cream = [246, 241, 222];
  const pink = [242, 183, 171];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dist = Math.hypot(x - 100, y - 100) / 60;
      const t = dist >= 1 ? 1 : dist * dist * (3 - 2 * dist);
      const i = (y * width + x) * 4;
      pixels[i] = Math.round(pink[0] + (cream[0] - pink[0]) * t);
      pixels[i + 1] = Math.round(pink[1] + (cream[1] - pink[1]) * t);
      pixels[i + 2] = Math.round(pink[2] + (cream[2] - pink[2]) * t);
      pixels[i + 3] = 255;
    }
  }
  return { width, height, pixels };
}

describe("vtracer WASM pipeline", () => {
  it("traces the default settings into clean color layers", () => {
    const { width, height, pixels } = logoPixels();
    const out = trace(width, height, pixels, defaultOptions());
    expect(out.width).toBe(width);
    expect(out.height).toBe(height);
    expect(out.layers.length).toBe(3);
    expect(out.layers.map((l) => l.color).sort()).toEqual(
      ["#1E50DC", "#DC1E1E", "#FFFFFF"].sort(),
    );
    expect(out.svg).toContain("<svg");
    expect(out.svg).not.toMatch(/NaN/);
    expect(out.metrics.pathCount).toBeGreaterThan(0);
    expect(out.metrics.nodeCount).toBeGreaterThan(0);
  });

  it("spline default produces smaller output than pixel mode", () => {
    const { width, height, pixels } = noisyPixels();
    // Use a restrictive flatClusterMaxDelta so polygon simplification stays
    // active; with the default exact-walk-everywhere (1000) both modes take
    // the exact walk and produce identical output.
    const opts = { ...defaultOptions(), flatClusterMaxDelta: 96 };
    const spline = trace(width, height, pixels, opts);
    const pixel = trace(
      width,
      height,
      pixels,
      { ...opts, mode: "none" } as Record<string, unknown>,
    );
    expect(spline.layers.length).toBe(pixel.layers.length);
    expect(spline.svg.length).toBeLessThan(pixel.svg.length);
  });

  it("preserves soft gradient detail instead of washing it into one layer", () => {
    // Mimics illustration shading (e.g. a pink inner ear on cream): a soft
    // radial gradient. Coarse color clustering chains the whole gradient
    // into a single washed-out layer; exact clustering keeps pink bands.
    const { width, height, pixels } = softPinkBlob();
    const out = trace(width, height, pixels, defaultOptions());
    const pinkness = (hex: string): number => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return r - (g + b) / 2;
    };
    const pinkLayers = out.layers.filter((l) => pinkness(l.color) > 30);
    expect(out.layers.length).toBeGreaterThan(1);
    expect(pinkLayers.length).toBeGreaterThan(0);
  });

  it("keys out a transparent background and keeps the artwork", () => {
    const width = 60;
    const height = 60;
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x > y - 8 && x < y + 8) {
          const i = (y * width + x) * 4;
          pixels[i] = 30;
          pixels[i + 1] = 180;
          pixels[i + 2] = 60;
          pixels[i + 3] = 255;
        }
      }
    }
    const out = trace(width, height, pixels, defaultOptions());
    expect(out.layers.length).toBe(1);
  });

  it("returns zero layers for a fully transparent image", () => {
    const width = 40;
    const height = 40;
    const out = trace(
      width,
      height,
      new Uint8Array(width * height * 4),
      defaultOptions(),
    );
    // The worker converts this into a friendly "nothing to trace" error.
    expect(out.layers.length).toBe(0);
  });

  it("flattens a semi-transparent halo instead of tracing it as solid", () => {
    // 60x60 opaque black square with a 10px semi-transparent black halo,
    // like the soft edge of a PNG logo. The halo must not bloat the shape.
    const width = 200;
    const height = 200;
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const dx = Math.max(70 - x, 0, x - 129);
        const dy = Math.max(70 - y, 0, y - 129);
        const d = Math.hypot(dx, dy);
        if (d <= 0) {
          pixels[i + 3] = 255;
        } else if (d < 10) {
          pixels[i + 3] = Math.round(255 * (1 - d / 10));
        } else {
          pixels[i] = 255;
          pixels[i + 1] = 255;
          pixels[i + 2] = 255;
          pixels[i + 3] = 0;
        }
      }
    }
    const out = trace(width, height, pixels, defaultOptions());
    const black = out.layers.filter((l) => l.color === "#000000");
    expect(black.length).toBe(1);
    let area = 0;
    for (const path of black[0].paths) {
      const pts = path.points;
      if (pts.length < 3) continue;
      let a = 0;
      for (let k = 0; k < pts.length; k += 1) {
        const p = pts[k];
        const q = pts[(k + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
      }
      area += Math.abs(a) / 2;
    }
    // Opaque core is 3600 px; the >=50% opaque part of the halo adds ~1300.
    // Without the fix the full halo traced as solid black and the area blew
    // out past 6200.
    expect(area).toBeLessThan(5200);
  });

  it("reports path points in absolute image coordinates", () => {
    // 100x100 hard square at (50,50). The points must line up with the
    // pixels, not be shifted by the SVG translate offset a second time.
    const width = 200;
    const height = 200;
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const inside = x >= 50 && x < 150 && y >= 50 && y < 150;
        const v = inside ? 0 : 255;
        pixels[i] = v;
        pixels[i + 1] = v;
        pixels[i + 2] = v;
        pixels[i + 3] = 255;
      }
    }
    const out = trace(width, height, pixels, defaultOptions());
    const black = out.layers.find((l) => l.color === "#000000");
    expect(black).toBeDefined();
    let minX = Infinity;
    let maxX = -Infinity;
    for (const path of black!.paths) {
      const pts = path.points;
      for (const pt of pts) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
      }
    }
    expect(minX).toBeGreaterThanOrEqual(49);
    expect(maxX).toBeLessThanOrEqual(151);
  });

  it("recolors color-path cluster fills from the original pixels", () => {
    // Solid square whose "prepped" pixels sit outside the scoring
    // tolerance of the original colors (mimics median/posterize/vote
    // color shift). The recolor must recover the original fill.
    const width = 80;
    const height = 80;
    const prepped = new Uint8Array(width * height * 4);
    const original = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const inside = x >= 20 && x < 60 && y >= 20 && y < 60;
        const pc = inside ? [150, 100, 50] : [255, 255, 255];
        const oc = inside ? [180, 130, 80] : [255, 255, 255];
        prepped[i] = pc[0];
        prepped[i + 1] = pc[1];
        prepped[i + 2] = pc[2];
        prepped[i + 3] = 255;
        original[i] = oc[0];
        original[i + 1] = oc[1];
        original[i + 2] = oc[2];
        original[i + 3] = 255;
      }
    }
    const opts = JSON.stringify(defaultOptions());
    const recolored = JSON.parse(
      trace_rgba_to_json_with_originals(width, height, prepped, original, opts),
    ) as TraceOutput;
    const plain = JSON.parse(
      trace_rgba_to_json(width, height, prepped, opts),
    ) as TraceOutput;
    const squareRecolored = recolored.layers.find(
      (l) => l.color !== "#FFFFFF",
    );
    const squarePlain = plain.layers.find((l) => l.color !== "#FFFFFF");
    expect(squarePlain).toBeDefined();
    expect(squarePlain!.color).toBe("#966432");
    expect(squareRecolored).toBeDefined();
    expect(squareRecolored!.color).toBe("#B48250");
    // The white background fill is untouched in both.
    expect(recolored.layers.some((l) => l.color === "#FFFFFF")).toBe(true);
  });

  it("keeps the current fill when the originals are within tolerance", () => {
    // Original pixels equal the prepped pixels: nothing to recover, so the
    // recolor export must produce the same fills as the plain export.
    const { width, height, pixels } = logoPixels();
    const opts = JSON.stringify(defaultOptions());
    const recolored = JSON.parse(
      trace_rgba_to_json_with_originals(width, height, pixels, pixels, opts),
    ) as TraceOutput;
    const plain = JSON.parse(
      trace_rgba_to_json(width, height, pixels, opts),
    ) as TraceOutput;
    expect(recolored.layers.map((l) => l.color).sort()).toEqual(
      plain.layers.map((l) => l.color).sort(),
    );
  });
});
