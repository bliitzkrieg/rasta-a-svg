import { describe, expect, it } from "vitest";
import { medianFilter5x5 } from "@/lib/image/medianFilter";
import {
  isRestoreDamaging,
  restoreDamagePassthrough,
} from "@/lib/image/restoreDamage";

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

/**
 * Flat art with soft 1px edge gradients: white field with a gray disc
 * edge band. Few colors (a palette tier fires) and the median rewrites
 * the soft band pixels, so the unsharp restore would apply and halo.
 */
function softEdgedDisc(width: number, height: number): Uint8ClampedArray {
  const px = solidRgba(width, height, 255);
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 3;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const d = Math.hypot(x - cx, y - cy) - r;
      if (d < -1 || d > 2) {
        continue;
      }
      const i = (y * width + x) * 4;
      const v = d <= 0 ? 128 : 200;
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
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

describe("isRestoreDamaging", () => {
  it("fires on flat art where the restore would apply", () => {
    const raw = softEdgedDisc(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(isRestoreDamaging(raw, denoised, 64, 64)).toBe(true);
  });

  it("does not fire on flat art the median leaves alone (restore is a no-op)", () => {
    const raw = solidRgba(32, 32, 200);
    const denoised = medianFilter5x5(raw, 32, 32);
    expect(isRestoreDamaging(raw, denoised, 32, 32)).toBe(false);
  });

  it("does not fire on many-colored content (no palette tier)", () => {
    const raw = manyColors(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(isRestoreDamaging(raw, denoised, 64, 64)).toBe(false);
  });
});

describe("restoreDamagePassthrough", () => {
  it("returns the denoised pixels when the restore would damage", () => {
    const raw = softEdgedDisc(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(restoreDamagePassthrough(raw, denoised, 64, 64)).toBe(denoised);
  });

  it("returns null when the restore is harmless or a no-op", () => {
    const raw = solidRgba(32, 32, 200);
    const denoised = medianFilter5x5(raw, 32, 32);
    expect(restoreDamagePassthrough(raw, denoised, 32, 32)).toBe(null);
  });
});
