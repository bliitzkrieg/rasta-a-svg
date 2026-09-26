import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import { toVTracerOptions } from "@/lib/vectorize/vtracerOptions";
import {
  initSync,
  trace_rgba_to_json,
} from "@/public/vendor/vtracer/vtracer_wasm.js";

const wasmBytes = (() => {
  const raw = readFileSync(
    resolve(__dirname, "../public/vendor/vtracer/vtracer_wasm_bg.wasm"),
  );
  const copy = new Uint8Array(raw.length);
  copy.set(raw);
  return copy.buffer;
})();

initSync({ module: wasmBytes });

interface TraceLayer {
  name: string;
  color: string;
  paths: unknown[];
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
    const { width, height, pixels } = logoPixels();
    const spline = trace(width, height, pixels, defaultOptions());
    const pixel = trace(
      width,
      height,
      pixels,
      { ...defaultOptions(), mode: "none" } as Record<string, unknown>,
    );
    expect(spline.layers.length).toBe(pixel.layers.length);
    expect(spline.svg.length).toBeLessThan(pixel.svg.length);
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
});
