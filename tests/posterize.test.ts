import { describe, expect, it } from "vitest";
import { POSTERIZE_LEVELS, posterizeImageData } from "@/lib/image/posterize";

function solidRgba(width: number, height: number, r: number, g: number, b: number, a: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  }
  return px;
}

describe("posterizeImageData", () => {
  it("uses 64 levels by default", () => {
    expect(POSTERIZE_LEVELS).toBe(64);
  });

  it("snaps channels to evenly spaced levels", () => {
    // With 64 levels the step is 255/63 ~ 4.0476; 128 snaps to the
    // nearest level the same way numpy's rint does (round-half-to-even).
    const px = solidRgba(1, 1, 128, 0, 255, 255);
    const out = posterizeImageData(px, 1, 1);
    // 128 * 63 / 255 = 31.6235 -> 32 -> 32 * 255 / 63 = 129.5238 -> 130
    expect(out[0]).toBe(130);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(255);
  });

  it("passes alpha through untouched", () => {
    const px = solidRgba(2, 2, 123, 45, 67, 89);
    const out = posterizeImageData(px, 2, 2);
    for (let i = 3; i < out.length; i += 4) {
      expect(out[i]).toBe(89);
    }
  });

  it("leaves already-quantized flat colors unchanged", () => {
    // 0, 255, and exact multiples of 255/63 are fixed points.
    const level = Math.round((255 / 63) * 32);
    const px = solidRgba(4, 4, 0, 255, level, 200);
    const out = posterizeImageData(px, 4, 4);
    expect(Array.from(out)).toEqual(Array.from(px));
  });

  it("limits output channels to the requested number of levels", () => {
    const width = 256;
    const px = new Uint8ClampedArray(width * 4);
    for (let x = 0; x < width; x += 1) {
      px[x * 4] = x;
      px[x * 4 + 1] = 255 - x;
      px[x * 4 + 2] = x;
      px[x * 4 + 3] = 255;
    }
    const out = posterizeImageData(px, width, 1, 8);
    const seen = new Set<number>();
    for (let i = 0; i < out.length; i += 4) {
      seen.add(out[i]);
    }
    expect(seen.size).toBeLessThanOrEqual(8);
  });

  it("respects a custom level count", () => {
    const px = solidRgba(1, 1, 200, 200, 200, 255);
    const out = posterizeImageData(px, 1, 1, 2);
    // 2 levels: 200 * 1 / 255 = 0.784 -> 1 -> 255
    expect(out[0]).toBe(255);
    expect(out[3]).toBe(255);
  });
});
