import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import { toVTracerOptions } from "@/lib/vectorize/vtracerOptions";
import {
  innerSvgPaths,
  paletteRanks,
  rgbToHex,
  topOpaquePalette,
  traceBinaryLayers,
} from "@/lib/vectorize/binaryLayers";
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

function makePixels(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }
  }
  return pixels;
}

function traceFn(
  width: number,
  height: number,
  pixels: Uint8Array,
  optionsJson: string,
): string {
  return trace_rgba_to_json(width, height, pixels, optionsJson);
}

function defaultOptionsJson(): string {
  return JSON.stringify(toVTracerOptions(DEFAULT_SETTINGS));
}

describe("topOpaquePalette", () => {
  it("ranks opaque colors by count and ignores transparent pixels", () => {
    // 4x2: 4 black, 2 white, 2 transparent red (excluded).
    const pixels = makePixels(4, 2, (x, y) =>
      y === 1 && x >= 2
        ? [255, 0, 0, 0]
        : x >= 3 || (y === 1 && x === 2)
          ? [255, 255, 255, 255]
          : [0, 0, 0, 255],
    );
    const palette = topOpaquePalette(pixels, 4, 2, 2);
    expect(palette).toEqual([
      [0, 0, 0],
      [255, 255, 255],
    ]);
  });

  it("breaks count ties by ascending rgb key for determinism", () => {
    const pixels = makePixels(2, 2, (x, y) =>
      x === 0 && y === 0
        ? [255, 0, 0, 255]
        : x === 1 && y === 0
          ? [0, 255, 0, 255]
          : x === 0 && y === 1
            ? [0, 0, 255, 255]
            : [255, 255, 0, 255],
    );
    const palette = topOpaquePalette(pixels, 2, 2, 4);
    expect(palette).toEqual([
      [0, 0, 255],
      [0, 255, 0],
      [255, 0, 0],
      [255, 255, 0],
    ]);
  });
});

describe("paletteRanks", () => {
  it("assigns ranks and -1 for off-palette or transparent pixels", () => {
    const pixels = makePixels(3, 1, (x) =>
      x === 0
        ? [0, 0, 0, 255]
        : x === 1
          ? [255, 255, 255, 255]
          : [255, 255, 255, 0],
    );
    const ranks = paletteRanks(pixels, 3, 1, [
      [0, 0, 0],
      [255, 255, 255],
    ]);
    expect([...ranks]).toEqual([0, 1, -1]);
  });
});

describe("rgbToHex", () => {
  it("emits uppercase hex like the wasm tracer", () => {
    expect(rgbToHex([174, 174, 178])).toBe("#AEAEB2");
  });
});

describe("innerSvgPaths", () => {
  it("strips the svg wrapper and returns the entries", () => {
    const doc =
      `<?xml version="1.0" encoding="UTF-8" ?>\n` +
      `<svg width="8pt" height="8pt" viewBox="0 0 8 8" version="1.1" xmlns="http://www.w3.org/2000/svg">\n` +
      `<path fill="#000000" d="M0 0h8v8H0z" transform="translate(0.00, 0.00)" />\n` +
      `</svg>\n`;
    expect(innerSvgPaths(doc)).toBe(
      `<path fill="#000000" d="M0 0h8v8H0z" transform="translate(0.00, 0.00)" />`,
    );
  });
});

describe("traceBinaryLayers", () => {
  it("merges nested binary masks recolored to the palette", () => {
    // 16x16: black square on white. Palette tier 2.
    const pixels = makePixels(16, 16, (x, y) =>
      x >= 4 && x < 12 && y >= 4 && y < 12
        ? [0, 0, 0, 255]
        : [255, 255, 255, 255],
    );
    const out = traceBinaryLayers(
      traceFn,
      16,
      16,
      pixels,
      2,
      defaultOptionsJson(),
    );
    expect(out.layers.length).toBe(2);
    expect(out.layers[0].name).toBe("COLOR_01");
    expect(out.layers[0].color).toBe("#FFFFFF");
    expect(out.layers[1].name).toBe("COLOR_02");
    expect(out.layers[1].color).toBe("#000000");
    // Every entry in the merged svg carries the palette fill.
    const fills = [...out.svg.matchAll(/fill="#[0-9A-F]{6}"/g)].map((m) => m[0].slice(6, -1));
    expect(fills.length).toBeGreaterThan(0);
    expect(new Set(fills)).toEqual(new Set(["#FFFFFF", "#000000"]));
    // The merged svg is a single valid document.
    expect(out.svg).toMatch(/^<\?xml version="1.0" encoding="UTF-8" \?>/);
    expect((out.svg.match(/<svg /g) ?? []).length).toBe(1);
    expect((out.svg.match(/<\/svg>/g) ?? []).length).toBe(1);
    expect(out.metrics.nodeCount).toBeGreaterThan(0);
    expect(out.metrics.pathCount).toBeGreaterThan(0);
  });

  it("skips empty layers when a palette color has no traceable area", () => {
    // 2x2, tier 4: the two rarest colors are 1px each and may vanish.
    const pixels = makePixels(2, 2, (x, y) =>
      x === 0 && y === 0
        ? [255, 0, 0, 255]
        : x === 1 && y === 0
          ? [0, 255, 0, 255]
          : x === 0 && y === 1
            ? [0, 0, 255, 255]
            : [255, 255, 0, 255],
    );
    const out = traceBinaryLayers(traceFn, 2, 2, pixels, 4, defaultOptionsJson());
    expect(out.layers.length).toBeGreaterThan(0);
    expect(out.layers.length).toBeLessThanOrEqual(4);
  });
});
