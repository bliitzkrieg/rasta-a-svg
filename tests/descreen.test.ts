import { describe, expect, it } from "vitest";
import { descreenIfDithered, gaussianBlur, isOrderedDither } from "@/lib/image/descreen";

function solidRgba(width: number, height: number, value: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  px.fill(value);
  return px;
}

function checkerboard(size: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = (x + y) % 2 === 0 ? 0 : 255;
      const i = (y * size + x) * 4;
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  return px;
}

describe("isOrderedDither", () => {
  it("detects a 1px checkerboard as ordered dither", () => {
    expect(isOrderedDither(checkerboard(32), 32, 32)).toBe(true);
  });

  it("does not flag flat images", () => {
    expect(isOrderedDither(solidRgba(32, 32, 128), 32, 32)).toBe(false);
  });

  it("does not flag a smooth gradient", () => {
    const w = 64;
    const h = 32;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const v = Math.round((x / (w - 1)) * 255);
        const i = (y * w + x) * 4;
        px[i] = v;
        px[i + 1] = v;
        px[i + 2] = v;
        px[i + 3] = 255;
      }
    }
    expect(isOrderedDither(px, w, h)).toBe(false);
  });

  it("returns false for degenerate sizes", () => {
    expect(isOrderedDither(new Uint8ClampedArray(4), 1, 1)).toBe(false);
  });
});

describe("gaussianBlur", () => {
  it("leaves a perfectly flat image untouched", () => {
    const px = solidRgba(16, 16, 200);
    expect(Array.from(gaussianBlur(px, 16, 16, 2.5))).toEqual(Array.from(px));
  });

  it("smooths a hard edge", () => {
    const w = 32;
    const h = 8;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const v = x < w / 2 ? 0 : 255;
        const i = (y * w + x) * 4;
        px[i] = v;
        px[i + 1] = v;
        px[i + 2] = v;
        px[i + 3] = 255;
      }
    }
    const out = gaussianBlur(px, w, h, 2.5);
    // Pixels adjacent to the edge move toward mid-gray from both sides.
    const leftEdge = out[(3 * w + w / 2 - 1) * 4];
    const rightEdge = out[(3 * w + w / 2) * 4];
    expect(leftEdge).toBeGreaterThan(0);
    expect(rightEdge).toBeLessThan(255);
    expect(leftEdge).toBeLessThan(rightEdge);
  });
});

describe("descreenIfDithered", () => {
  it("returns a blurred image for ordered dither", () => {
    const px = checkerboard(32);
    const out = descreenIfDithered(px, px, 32, 32);
    expect(out).not.toBeNull();
    // The checkerboard is smoothed toward mid-gray.
    const mid = out![(16 * 32 + 16) * 4];
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(156);
  });

  it("returns null for non-dithered input", () => {
    const px = solidRgba(32, 32, 128);
    expect(descreenIfDithered(px, px, 32, 32)).toBeNull();
  });
});
