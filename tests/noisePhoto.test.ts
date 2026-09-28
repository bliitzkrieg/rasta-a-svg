import { describe, expect, it } from "vitest";
import { medianFilter5x5 } from "@/lib/image/medianFilter";
import { isNoisyPhoto, noisePhotoPassthrough } from "@/lib/image/noisePhoto";

/** Solid gray: few colors, the median changes nothing. */
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
 * Heavy per-pixel noise over a 128-gray base: thousands of distinct
 * colors, and the 5x5 median rewrites nearly every pixel.
 */
function noisyPhoto(width: number, height: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  // xorshift32 (the classic glibc-style LCG loses float precision in JS,
  // collapsing the channel values).
  let seed = 0x12345678;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 64 + Math.floor(next() * 192);
    px[i + 1] = 64 + Math.floor(next() * 192);
    px[i + 2] = 64 + Math.floor(next() * 192);
    px[i + 3] = 255;
  }
  return px;
}

/** Many colors but smooth, so the median barely changes anything. */
function smoothManyColors(
  width: number,
  height: number
): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const v = (x * 7 + y * 13) % 256;
      px[i] = v;
      px[i + 1] = (v + 64) % 256;
      px[i + 2] = (v + 128) % 256;
      px[i + 3] = 255;
    }
  }
  return px;
}

describe("isNoisyPhoto", () => {
  it("fires on heavy photographic noise", () => {
    const raw = noisyPhoto(256, 256);
    const denoised = medianFilter5x5(raw, 256, 256);
    expect(isNoisyPhoto(raw, 256, 256, denoised)).toBe(true);
  });

  it("does not fire on flat artwork", () => {
    const raw = solidRgba(64, 64, 128);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(isNoisyPhoto(raw, 64, 64, denoised)).toBe(false);
  });

  it("does not fire on many-colored smooth content", () => {
    const raw = smoothManyColors(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(isNoisyPhoto(raw, 64, 64, denoised)).toBe(false);
  });
});

describe("noisePhotoPassthrough", () => {
  it("returns the raw pixels on noisy photos", () => {
    const raw = noisyPhoto(256, 256);
    const denoised = medianFilter5x5(raw, 256, 256);
    expect(noisePhotoPassthrough(raw, 256, 256, denoised)).toBe(raw);
  });

  it("returns null on flat artwork", () => {
    const raw = solidRgba(64, 64, 128);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(noisePhotoPassthrough(raw, 64, 64, denoised)).toBeNull();
  });
});
