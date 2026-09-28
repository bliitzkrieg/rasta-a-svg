import { describe, expect, it } from "vitest";
import { medianFilter5x5 } from "@/lib/image/medianFilter";
import {
  isSoftAlphaArt,
  partialAlphaFraction,
  softAlphaPassthrough,
} from "@/lib/image/softAlpha";

/** Solid RGBA fill. */
function solidRgba(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a: number
): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  }
  return px;
}

/**
 * Busy flat art: alternating 6px black/white stripes, each boundary
 * softened by a 2px anti-aliased band (partial alpha, blended gray), the
 * way a PNG exporter anti-aliases many small edges. The thin bands are
 * narrower than the 5x5 median window, so the median flips their alpha
 * on a large share of pixels.
 */
function softEdge(width: number, height: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  const stripe = 6;
  const band = 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (x % stripe < stripe - band) {
        const v = Math.floor(x / stripe) % 2 === 0 ? 0 : 255;
        px[i] = v;
        px[i + 1] = v;
        px[i + 2] = v;
        px[i + 3] = 255;
      } else {
        px[i] = 128;
        px[i + 1] = 128;
        px[i + 2] = 128;
        px[i + 3] = 128;
      }
    }
  }
  return px;
}

/** Same split as softEdge but with a hard edge: no partial alpha. */
function hardEdge(width: number, height: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  const mid = Math.floor(width / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const v = x < mid ? 0 : 255;
      px[i] = v;
      px[i + 1] = v;
      px[i + 2] = v;
      px[i + 3] = 255;
    }
  }
  return px;
}

describe("partialAlphaFraction", () => {
  it("counts only strictly partial alpha pixels", () => {
    const raw = softEdge(64, 64);
    const frac = partialAlphaFraction(raw, 64, 64);
    expect(frac).toBeGreaterThanOrEqual(0.01);
    expect(frac).toBeLessThan(0.5);
    expect(partialAlphaFraction(hardEdge(64, 64), 64, 64)).toBe(0);
    // Fully transparent pixels are background keying, not soft edges.
    expect(partialAlphaFraction(solidRgba(16, 16, 0, 0, 0, 0), 16, 16)).toBe(0);
  });
});

describe("isSoftAlphaArt", () => {
  it("fires on soft anti-aliased artwork", () => {
    const raw = softEdge(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(isSoftAlphaArt(raw, 64, 64, denoised)).toBe(true);
  });

  it("does not fire on hard-edged flat artwork", () => {
    const raw = hardEdge(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(isSoftAlphaArt(raw, 64, 64, denoised)).toBe(false);
  });

  it("does not fire on a smooth partial-alpha region the median leaves alone", () => {
    // A large uniformly translucent square: partial alpha is common but
    // the median only rewrites the thin border ring, under 10%.
    const raw = solidRgba(64, 64, 128, 128, 128, 255);
    for (let y = 16; y < 48; y += 1) {
      for (let x = 16; x < 48; x += 1) {
        raw[(y * 64 + x) * 4 + 3] = 128;
      }
    }
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(partialAlphaFraction(raw, 64, 64)).toBeGreaterThanOrEqual(0.01);
    expect(isSoftAlphaArt(raw, 64, 64, denoised)).toBe(false);
  });
});

describe("softAlphaPassthrough", () => {
  it("returns the raw pixels on soft anti-aliased artwork", () => {
    const raw = softEdge(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(softAlphaPassthrough(raw, 64, 64, denoised)).toBe(raw);
  });

  it("returns null on hard-edged flat artwork", () => {
    const raw = hardEdge(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(softAlphaPassthrough(raw, 64, 64, denoised)).toBeNull();
  });
});
