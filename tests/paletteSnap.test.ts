import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  damageCheckedPaletteSnapTier,
  gatedPaletteSnapTiered,
  paletteSnapImageData,
  paletteSnapTier,
  snapPreservedFraction,
  PALETTE_SNAP_COLORS,
  PALETTE_SNAP_MIN_PRESERVED_FRACTION,
  PALETTE_SNAP_MIN_TOPK_COVERAGE,
  PALETTE_SNAP_TIER3_COLORS,
  PALETTE_SNAP_TIER3_MIN_TOP16_COVERAGE,
  PALETTE_SNAP_TOLERANCE,
} from "@/lib/image/paletteSnap";

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

describe("paletteSnapImageData", () => {
  it("snaps fringe tints to the dominant palette color", () => {
    // 6x1: three black, two white, one near-black fringe. The top-2
    // colors are unambiguous (black 3, white 2).
    const pixels = makePixels(6, 1, (x) =>
      x === 5
        ? [18, 18, 18, 255]
        : x >= 3
          ? [255, 255, 255, 255]
          : [0, 0, 0, 255],
    );
    const out = paletteSnapImageData(pixels, 6, 1, 2);
    // The fringe is nearer to black (18^2*3 = 972) than white
    // (237^2*3 = 168507), so it snaps to black.
    const fringe = 5 * 4;
    expect([out[fringe], out[fringe + 1], out[fringe + 2]]).toEqual([0, 0, 0]);
    expect(out[fringe + 3]).toBe(255);
    // Dominant colors are untouched.
    for (const x of [0, 1, 2]) {
      expect([out[x * 4], out[x * 4 + 1], out[x * 4 + 2]]).toEqual([0, 0, 0]);
    }
    for (const x of [3, 4]) {
      expect([out[x * 4], out[x * 4 + 1], out[x * 4 + 2]]).toEqual([255, 255, 255]);
    }
  });

  it("returns the input unchanged when colors fit the budget", () => {
    const pixels = makePixels(2, 2, (x) => (x === 0 ? [10, 20, 30, 255] : [40, 50, 60, 200]));
    const out = paletteSnapImageData(pixels, 2, 2, 8);
    expect(out).toEqual(pixels);
  });

  it("passes alpha through untouched", () => {
    const pixels = makePixels(3, 1, (x) =>
      x === 0 ? [0, 0, 0, 0] : x === 1 ? [17, 17, 17, 128] : [255, 255, 255, 255],
    );
    const out = paletteSnapImageData(pixels, 3, 1, 2);
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(128);
    expect(out[11]).toBe(255);
  });
});

describe("paletteSnapTier constants", () => {
  it("exposes the tuned constants", () => {
    expect(PALETTE_SNAP_COLORS).toBe(8);
    expect(PALETTE_SNAP_MIN_TOPK_COVERAGE).toBe(0.9);
    expect(PALETTE_SNAP_TIER3_COLORS).toBe(16);
    expect(PALETTE_SNAP_TIER3_MIN_TOP16_COVERAGE).toBe(0.4);
    expect(PALETTE_SNAP_TOLERANCE).toBe(24);
    expect(PALETTE_SNAP_MIN_PRESERVED_FRACTION).toBe(0.99);
  });
});

describe("paletteSnapTier", () => {
  it("selects tier 1 (k=n) for few colors", () => {
    // thin_lines (thin-structure passthrough skips the median): 3 unique
    // colors -> tier 3 (snap is the identity; binary layers trace all 3).
    const [w, h] = readFileSync("/tmp/ps_thin_lines.png.size", "utf8")
      .trim()
      .split(" ")
      .map(Number);
    const input = new Uint8ClampedArray(
      readFileSync("/tmp/ps_thin_lines.png.in.rgba").buffer,
    );
    expect(paletteSnapTier(input)).toBe(3);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });

  it("selects tier 2 (k=8) for flat artwork with fringes", () => {
    // goose_balloon: 163 unique colors, top-8 cover 97.5%.
    const input = new Uint8ClampedArray(
      readFileSync("/tmp/ps_goose_balloon.png.in.rgba").buffer,
    );
    expect(paletteSnapTier(input)).toBe(8);
  });

  it("selects tier 3 (k=16) for clustered mid-complexity", () => {
    // wikipedia_logo: 260 unique colors, top-16 cover 47.2%.
    const input = new Uint8ClampedArray(
      readFileSync("/tmp/ps_wikipedia_logo.png.in.rgba").buffer,
    );
    expect(paletteSnapTier(input)).toBe(16);
  });

  it("returns null for diffuse content", () => {
    // photo: 7146 unique colors, top-16 cover 14.5%.
    const input = new Uint8ClampedArray(
      readFileSync("/tmp/ps_photo.png.in.rgba").buffer,
    );
    expect(paletteSnapTier(input)).toBeNull();
    // gradient: 6818 unique colors, top-16 cover 0.6%.
    const grad = new Uint8ClampedArray(
      readFileSync("/tmp/ps_gradient.png.in.rgba").buffer,
    );
    expect(paletteSnapTier(grad)).toBeNull();
  });
});

describe("snapPreservedFraction", () => {
  it("counts pixels within the 24/255 tolerance as preserved", () => {
    // 4x1: identical, at-tolerance (24), over-tolerance (25), far.
    const original = makePixels(4, 1, () => [100, 100, 100, 255]);
    const snapped = makePixels(4, 1, (x) =>
      x === 0
        ? [100, 100, 100, 255]
        : x === 1
          ? [124, 100, 100, 255]
          : x === 2
            ? [125, 100, 100, 255]
            : [200, 100, 100, 255],
    );
    expect(snapPreservedFraction(original, snapped, 4, 1)).toBe(0.5);
  });

  it("ignores alpha differences", () => {
    const original = makePixels(2, 1, () => [50, 60, 70, 0]);
    const snapped = makePixels(2, 1, () => [50, 60, 70, 255]);
    expect(snapPreservedFraction(original, snapped, 2, 1)).toBe(1);
  });
});

describe("damageCheckedPaletteSnapTier", () => {
  it("drops a lossy tier-3 snap on noisy illustration shading", () => {
    // wikipedia_logo: raw tier is 16, but the snap to 16 preserves only
    // ~91% of pixels within tolerance, so the damage check drops it.
    const input = new Uint8ClampedArray(
      readFileSync("/tmp/ps_wikipedia_logo.png.in.rgba").buffer,
    );
    const [w, h] = readFileSync("/tmp/ps_wikipedia_logo.png.size", "utf8")
      .trim()
      .split(" ")
      .map(Number);
    expect(paletteSnapTier(input)).toBe(16);
    expect(damageCheckedPaletteSnapTier(input, w, h)).toBeNull();
    // gatedPaletteSnapTiered then returns the input unchanged.
    const out = gatedPaletteSnapTiered(input, w, h);
    expect(out).toEqual(input);
  });

  it("keeps tiers whose snap is harmless", () => {
    // goose_balloon: raw tier 8, upgraded to 16 by
    // damageCheckedPaletteSnapTier (the finer snap preserves at least as
    // much and traces better); snap preserves ~100% within tolerance.
    const gb = new Uint8ClampedArray(
      readFileSync("/tmp/ps_goose_balloon.png.in.rgba").buffer,
    );
    const [gw, gh] = readFileSync("/tmp/ps_goose_balloon.png.size", "utf8")
      .trim()
      .split(" ")
      .map(Number);
    expect(damageCheckedPaletteSnapTier(gb, gw, gh)).toBe(16);
    // thin_lines: tier 3 (n=3), the snap is the identity.
    const tl = new Uint8ClampedArray(
      readFileSync("/tmp/ps_thin_lines.png.in.rgba").buffer,
    );
    const [tw, th] = readFileSync("/tmp/ps_thin_lines.png.size", "utf8")
      .trim()
      .split(" ")
      .map(Number);
    expect(damageCheckedPaletteSnapTier(tl, tw, th)).toBe(3);
  });

  it("returns null when no tier fires", () => {
    const photo = new Uint8ClampedArray(
      readFileSync("/tmp/ps_photo.png.in.rgba").buffer,
    );
    const [w, h] = readFileSync("/tmp/ps_photo.png.size", "utf8")
      .trim()
      .split(" ")
      .map(Number);
    expect(damageCheckedPaletteSnapTier(photo, w, h)).toBeNull();
  });
});

describe("gatedPaletteSnapTiered", () => {
  it("matches the parity harness byte-identically on real images", () => {
    for (const name of [
      "diagonal_text.png",
      "goose_balloon.png",
      "text_logo.png",
      "photo.png",
      "gradient.png",
      "transparency.png",
      "wikipedia_logo.png",
      "thin_lines.png",
      "dither.png",
    ]) {
      const [w, h] = readFileSync(`/tmp/ps_${name}.size`, "utf8")
        .trim()
        .split(" ")
        .map(Number);
      const input = new Uint8ClampedArray(
        readFileSync(`/tmp/ps_${name}.in.rgba`).buffer,
      );
      const expected = new Uint8ClampedArray(
        readFileSync(`/tmp/ps_${name}.out.rgba`).buffer,
      );
      const out = gatedPaletteSnapTiered(input, w, h);
      expect(out.length).toBe(expected.length);
      // Manual byte loop: vitest's toEqual takes ~30s on 4M-element
      // arrays, which blows the timeout; a loop is milliseconds.
      let firstBad = -1;
      for (let i = 0; i < out.length; i++) {
        if (out[i] !== expected[i]) {
          firstBad = i;
          break;
        }
      }
      expect(firstBad).toBe(-1);
    }
  }, 60000);
});
