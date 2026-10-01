import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import {
  buildCutPalette,
  cutFileInches,
  cutLayerMasks,
  traceCutFile,
  translatePathData,
  CUT_MAX_INCHES,
} from "@/lib/vectorize/cutFile";
import { matchPreset, PRESETS } from "@/lib/presets";
import { snapNearOpaqueAlpha } from "@/lib/image/preprocess";
import { initSync, trace_rgba_to_json } from "@/public/vendor/vtracer/vtracer_wasm.js";

vi.setConfig({ testTimeout: 20_000, hookTimeout: 30_000 });

beforeAll(() => {
  const raw = readFileSync(resolve(__dirname, "../public/vendor/vtracer/vtracer_wasm_bg.wasm"));
  const copy = new Uint8Array(raw.length);
  copy.set(raw);
  initSync({ module: copy.buffer as ArrayBuffer });
});

const CUT_SETTINGS = PRESETS.find((preset) => preset.id === "cricut")!.settings;

type Rgba = [number, number, number, number];

/** Image from a painter callback. */
function image(width: number, height: number, paint: (x: number, y: number) => Rgba): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      px.set(paint(x, y), (y * width + x) * 4);
    }
  }
  return px;
}

const WHITE: Rgba = [255, 255, 255, 255];
const NAVY: Rgba = [20, 40, 90, 255];
const ORANGE: Rgba = [250, 110, 20, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

/** A navy ring with an orange disc in its hole, on a white background. */
function ringOnWhite(x: number, y: number): Rgba {
  const r = Math.hypot(x - 40, y - 40);
  if (r < 12) return ORANGE;
  if (r < 30 && r >= 18) return NAVY;
  return WHITE;
}

describe("buildCutPalette", () => {
  it("removes a solid background and keeps the design colors", () => {
    const px = image(80, 80, ringOnWhite);
    const { palette, labels, backgroundRemoved } = buildCutPalette(px, 80, 80, 0);
    expect(backgroundRemoved).toBe(true);
    expect(palette).toHaveLength(2);
    expect(labels[0]).toBe(-1);
    // White between the ring and the disc is background too: it becomes a hole.
    expect(labels[40 * 80 + 40 + 15]).toBe(-1);
  });

  it("keeps white when the image already has a transparent background", () => {
    const px = image(80, 80, (x, y) => {
      const c = ringOnWhite(x, y);
      return c === WHITE && Math.hypot(x - 40, y - 40) >= 30 ? CLEAR : c;
    });
    const { palette, backgroundRemoved } = buildCutPalette(px, 80, 80, 0);
    expect(backgroundRemoved).toBe(false);
    expect(palette).toHaveLength(3);
  });

  it("merges anti-aliasing shades instead of giving each its own mat", () => {
    // Black text-like bars with a 1px fringe of many gray shades (like
    // anti-aliased lettering), on white.
    const px = image(100, 60, (x, y) => {
      const bar = x % 20;
      if (y > 10 && y < 50 && bar >= 5 && bar < 12) return [17, 17, 17, 255];
      if (y > 10 && y < 50 && bar === 12) {
        const gray = 40 + ((y * 37) % 180);
        return [gray, gray, gray, 255];
      }
      return WHITE;
    });
    const { palette } = buildCutPalette(px, 100, 60, 0);
    expect(palette).toHaveLength(1);
  });

  it("honors an explicit color count", () => {
    const px = image(80, 80, ringOnWhite);
    expect(buildCutPalette(px, 80, 80, 1).palette).toHaveLength(1);
  });
});

describe("cutLayerMasks", () => {
  const px = image(80, 80, (x, y) => {
    const c = ringOnWhite(x, y);
    return c === WHITE && Math.hypot(x - 40, y - 40) >= 30 ? CLEAR : c;
  });
  const palette = buildCutPalette(px, 80, 80, 0);

  it("every pixel shows its own color when the layers are stacked", () => {
    for (const stacked of [true, false]) {
      const masks = cutLayerMasks(palette, 80, 80, stacked, 1);
      for (let i = 0; i < 80 * 80; i += 1) {
        let top = -1;
        masks.forEach((layer, index) => {
          if (layer.mask[i]) top = index;
        });
        const expected = palette.labels[i] < 0 ? null : palette.palette[palette.labels[i]];
        expect(top >= 0 ? masks[top].color : null).toEqual(expected);
      }
    }
  });

  it("stacked fills holes covered by upper colors, sliced does not", () => {
    const stacked = cutLayerMasks(palette, 80, 80, true, 1);
    const sliced = cutLayerMasks(palette, 80, 80, false, 1);
    const center = 40 * 80 + 40;
    // The white layer (largest) sits under the navy ring and orange disc.
    expect(stacked[0].mask[center]).toBe(1);
    expect(sliced[0].mask[center]).toBe(0);
  });

  it("drops pieces and pinholes smaller than the minimum area", () => {
    const dots = image(60, 60, (x, y) => {
      if (x === 5 && y === 5) return NAVY; // 1px speck
      if (x >= 20 && x < 50 && y >= 20 && y < 50) return x === 35 && y === 35 ? CLEAR : NAVY; // pinhole
      return CLEAR;
    });
    const [layer] = cutLayerMasks(buildCutPalette(dots, 60, 60, 0), 60, 60, true, 9);
    expect(layer.mask[5 * 60 + 5]).toBe(0);
    expect(layer.mask[35 * 60 + 35]).toBe(1);
  });
});

describe("translatePathData", () => {
  it("shifts x and y of every point", () => {
    expect(translatePathData("M0 0 L10 5 C1 2 3 4 5 6 Z", 2, -1)).toBe("M2 -1 L12 4 C3 1 5 3 7 5 Z");
  });
});

describe("cutFileInches", () => {
  it("uses 96 px per inch and caps the long side to fit a 12 inch mat", () => {
    expect(cutFileInches(480, 240)).toEqual({ width: 5, height: 2.5 });
    const big = cutFileInches(4000, 2000);
    expect(big.width).toBeCloseTo(CUT_MAX_INCHES);
    expect(big.height).toBeCloseTo(CUT_MAX_INCHES / 2);
  });
});

describe("traceCutFile", () => {
  const trace = (w: number, h: number, p: Uint8Array, o: string) => trace_rgba_to_json(w, h, p, o);

  it("writes one smooth compound path per color, sized in inches, no background", () => {
    const px = image(80, 80, ringOnWhite);
    const result = traceCutFile(trace, px, 80, 80, CUT_SETTINGS, 960, 960);
    expect(result.backgroundRemoved).toBe(true);
    expect(result.pathCount).toBe(2);
    expect(result.layers.map((layer) => layer.color).sort()).toEqual(["#14285A", "#FA6E14"].sort());
    expect(result.svg).toMatch(/width="\d+\.\d{3}in" height="\d+\.\d{3}in"/);
    expect((result.svg.match(/<path\b/g) ?? []).length).toBe(2);
    // The download is cropped to the artwork; the preview keeps the source frame.
    expect(result.svg).toMatch(/viewBox="0 0 (59|60) (59|60)"/);
    expect(result.previewSvg).toContain('width="960" height="960" viewBox="0 0 80 80"');
    expect(result.svg).toContain(" C");
    // Nothing a cutter could trip over.
    expect(result.svg).not.toMatch(/transform=|opacity|<style|<rect|<g\b|pixel-corrections/);
  });

  it("renders like the source (ring with a hole, disc inside)", () => {
    const px = image(80, 80, ringOnWhite);
    const { svg } = traceCutFile(trace, px, 80, 80, CUT_SETTINGS, 80, 80);
    const rendered = new Resvg(svg, { fitTo: { mode: "original" } }).render();
    const pixels = rendered.pixels;
    const at = (x: number, y: number) => {
      // The file is cropped to the artwork (the ring spans 10..70).
      const scale = rendered.width / 60;
      const o = (Math.round((y - 10) * scale) * rendered.width + Math.round((x - 10) * scale)) * 4;
      return [pixels[o], pixels[o + 1], pixels[o + 2], pixels[o + 3]];
    };
    expect(at(40, 40)).toEqual(ORANGE);
    expect(at(40 + 24, 40)).toEqual(NAVY);
    expect(at(40 + 15, 40)[3]).toBe(0); // the gap between ring and disc is a hole
  });
});

describe("traceCutFile fill rule", () => {
  it("renders the same under nonzero and evenodd, whichever a cutter assumes", () => {
    const trace = (w: number, h: number, p: Uint8Array, o: string) => trace_rgba_to_json(w, h, p, o);
    // Nested rings and islands of two colors.
    const px = image(90, 90, (x, y) => {
      const r = Math.hypot(x - 45, y - 45);
      if (r < 6) return NAVY;
      if (r < 14) return ORANGE;
      if (r < 22) return NAVY;
      if (r < 30) return ORANGE;
      if (r < 40) return NAVY;
      return x < 8 && y < 8 ? ORANGE : WHITE;
    });
    for (const hierarchical of ["stacked", "cutout"] as const) {
      const { svg } = traceCutFile(trace, px, 90, 90, { ...CUT_SETTINGS, filterSpeckle: 1, hierarchical }, 90, 90);
      const nonzero = new Resvg(svg).render().pixels;
      const evenodd = new Resvg(svg.replaceAll("<path ", '<path fill-rule="evenodd" ')).render().pixels;
      expect(evenodd.equals(nonzero)).toBe(true);
    }
  });
});

describe("presets", () => {
  it("keeps the Cricut preset selected while its own options change", () => {
    expect(matchPreset({ ...CUT_SETTINGS, cutColors: 3, hierarchical: "cutout", filterSpeckle: 8 })).toBe("cricut");
  });
});

describe("snapNearOpaqueAlpha", () => {
  it("treats alpha 250-254 as opaque and 1-3 as transparent", () => {
    const px = new Uint8ClampedArray([1, 2, 3, 254, 1, 2, 3, 2, 1, 2, 3, 128]);
    expect([...snapNearOpaqueAlpha(px)]).toEqual([1, 2, 3, 255, 1, 2, 3, 0, 1, 2, 3, 128]);
  });

  it("returns the same array when nothing changes", () => {
    const px = new Uint8ClampedArray([1, 2, 3, 255, 0, 0, 0, 0]);
    expect(snapNearOpaqueAlpha(px)).toBe(px);
  });
});
