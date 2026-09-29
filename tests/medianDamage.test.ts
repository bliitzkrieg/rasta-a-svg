import { describe, expect, it } from "vitest";
import { medianFilter5x5 } from "@/lib/image/medianFilter";
import {
  isMedianDamaging,
  medianDamagePassthrough,
} from "@/lib/image/medianDamage";

function solidRgba(width: number, height: number, v: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
    px[i + 3] = 255;
  }
  return px;
}

/** Flat art with thin black structures: white field, 2px black bars. */
function thinBars(width: number, height: number): Uint8ClampedArray {
  const px = solidRgba(width, height, 255);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x % 12 < 2) {
        const i = (y * width + x) * 4;
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
      }
    }
  }
  return px;
}

/** Many-colored smooth pattern: the median changes little, colors abound. */
function manyColors(width: number, height: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      px[i] = (x * 7 + y * 13) % 256;
      px[i + 1] = (x * 11 + y * 5) % 256;
      px[i + 2] = (x * 3 + y * 17) % 256;
      px[i + 3] = 255;
    }
  }
  return px;
}

describe("isMedianDamaging", () => {
  it("fires on flat art with thin structures the median smears", () => {
    const raw = thinBars(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(isMedianDamaging(raw, 64, 64, denoised)).toBe(true);
  });

  it("does not fire on flat art the median leaves alone", () => {
    const raw = solidRgba(32, 32, 200);
    const denoised = medianFilter5x5(raw, 32, 32);
    expect(isMedianDamaging(raw, 32, 32, denoised)).toBe(false);
  });

  it("does not fire on many-colored content (no palette tier)", () => {
    // Thousands of distinct colors: no palette-snap tier fires, so the
    // gate stays shut even though the median rewrites pixels.
    const raw = manyColors(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(isMedianDamaging(raw, 64, 64, denoised)).toBe(false);
  });
});

describe("medianDamagePassthrough", () => {
  it("returns the raw pixels when the median is damaging", () => {
    const raw = thinBars(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(medianDamagePassthrough(raw, 64, 64, denoised)).toBe(raw);
  });

  it("returns null when the median is harmless", () => {
    const raw = solidRgba(32, 32, 200);
    const denoised = medianFilter5x5(raw, 32, 32);
    expect(medianDamagePassthrough(raw, 32, 32, denoised)).toBe(null);
  });
});
