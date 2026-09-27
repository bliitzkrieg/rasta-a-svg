import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  gatedPaletteSnap,
  paletteSnapImageData,
  shouldPaletteSnap,
  PALETTE_SNAP_COLORS,
  PALETTE_SNAP_MIN_TOPK_COVERAGE,
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

describe("shouldPaletteSnap", () => {
  it("fires on flat art with fringes, skips simple and complex images", () => {
    // Flat art with fringes: 90 black, 10 near-black fringe, 5 white.
    // Unique = 3 <= 8, so no snap needed (gate requires unique > colors).
    const simple = makePixels(21, 5, (x, y) => {
      const i = y * 21 + x;
      if (i < 90) return [0, 0, 0, 255];
      if (i < 100) return [12, 12, 12, 255];
      return [255, 255, 255, 255];
    });
    expect(shouldPaletteSnap(simple, 21, 5, 2, 0.9)).toBe(true);
    expect(shouldPaletteSnap(simple, 21, 5, 8, 0.9)).toBe(false);

    // Complex: 100 distinct colors, top-8 cover little.
    let n = 0;
    const complex = makePixels(10, 10, () => {
      n += 1;
      return [n % 256, (n * 7) % 256, (n * 13) % 256, 255];
    });
    expect(shouldPaletteSnap(complex, 10, 10, 8, 0.9)).toBe(false);
  });

  it("exposes the tuned constants", () => {
    expect(PALETTE_SNAP_COLORS).toBe(8);
    expect(PALETTE_SNAP_MIN_TOPK_COVERAGE).toBe(0.9);
  });
});

describe("gatedPaletteSnap", () => {
  it("matches the parity harness byte-identically on real images", () => {
    for (const name of [
      "diagonal_text.png",
      "goose_balloon.png",
      "text_logo.png",
      "photo.png",
      "gradient.png",
      "transparency.png",
      "wikipedia_logo.png",
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
      const out = gatedPaletteSnap(input, w, h);
      expect(out.length).toBe(expected.length);
      expect(out).toEqual(expected);
    }
  }, 60000);
});
