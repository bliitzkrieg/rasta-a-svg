import { describe, expect, it } from "vitest";
import {
  adaptiveEdgeRestore,
  noiseFraction,
  unsharpMask,
} from "@/lib/image/unsharpMask";

function solidRgba(width: number, height: number, value: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  px.fill(value);
  return px;
}

describe("noiseFraction", () => {
  it("returns 0 for identical images", () => {
    const a = solidRgba(4, 4, 128);
    expect(noiseFraction(a, a, 4, 4)).toBe(0);
  });

  it("returns 1 when every pixel changed beyond the delta", () => {
    const a = solidRgba(4, 4, 0);
    const b = solidRgba(4, 4, 255);
    expect(noiseFraction(a, b, 4, 4)).toBe(1);
  });
});

describe("unsharpMask", () => {
  it("leaves a perfectly flat image untouched", () => {
    const px = solidRgba(16, 16, 200);
    const out = unsharpMask(px, 16, 16);
    expect(Array.from(out)).toEqual(Array.from(px));
  });

  it("increases contrast at a hard edge", () => {
    const width = 32;
    const height = 8;
    const px = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const v = x < width / 2 ? 40 : 200;
        const i = (y * width + x) * 4;
        px[i] = v;
        px[i + 1] = v;
        px[i + 2] = v;
        px[i + 3] = 255;
      }
    }
    const out = unsharpMask(px, width, height);
    // Dark side of the edge gets darker, bright side gets brighter.
    const darkEdge = out[(3 * width + width / 2 - 1) * 4];
    const brightEdge = out[(3 * width + width / 2) * 4];
    expect(darkEdge).toBeLessThan(40);
    expect(brightEdge).toBeGreaterThan(200);
  });
});

describe("adaptiveEdgeRestore", () => {
  it("passes clean artwork through without sharpening", () => {
    const raw = solidRgba(8, 8, 100);
    const out = adaptiveEdgeRestore(raw, raw, 8, 8);
    expect(out).toBe(raw);
  });

  it("sharpens noisy input past the gate", () => {
    const width = 32;
    const height = 8;
    const raw = new Uint8ClampedArray(width * height * 4);
    const med = new Uint8ClampedArray(width * height * 4);
    // Simulate a noisy median result: every pixel differs by > 8.
    for (let i = 0; i < raw.length; i += 4) {
      raw[i] = 100;
      raw[i + 1] = 100;
      raw[i + 2] = 100;
      raw[i + 3] = 255;
      med[i] = 112;
      med[i + 1] = 112;
      med[i + 2] = 112;
      med[i + 3] = 255;
    }
    // Add a hard edge so the mask has something to act on.
    for (let y = 0; y < height; y += 1) {
      for (let x = width / 2; x < width; x += 1) {
        const i = (y * width + x) * 4;
        med[i] = 200;
        med[i + 1] = 200;
        med[i + 2] = 200;
      }
    }
    const out = adaptiveEdgeRestore(raw, med, width, height);
    expect(out).not.toBe(med);
  });
});
