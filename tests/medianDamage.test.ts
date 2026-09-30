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

/** Flat art with thin black structures: white field, 2px black bars.
 * Only two colors, so the damage-checked tier fires: binary-path content
 * where the median is kept (it cleans the palette snap). Rewrite is high
 * enough to hit the legacy band, so this documents legacy behavior. */
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

/**
 * Color-path flat art in the extended rewrite band: sparse 1px shaded
 * bars (erased by the median, ~1% rewrite) plus nine shaded rectangles
 * the median preserves. paletteSnapTier fires (tier 8) but the
 * damage-checked tier does NOT, on raw or denoised pixels, so the gate
 * fires via the extended band.
 */
function shadedArtwork(): Uint8ClampedArray {
  const w = 256;
  const h = 256;
  const px = solidRgba(w, h, 255);
  const shades = [10, 40, 70, 100, 130, 160, 190, 220, 0];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (x % 100 === 0) {
        const s = shades[(x + y) % shades.length];
        const i = (y * w + x) * 4;
        px[i] = s;
        px[i + 1] = s;
        px[i + 2] = s;
      }
    }
  }
  let k = 0;
  for (let ry = 0; ry < 3; ry += 1) {
    for (let rx = 0; rx < 3; rx += 1) {
      const s = shades[k];
      k += 1;
      const x0 = 20 + rx * 80;
      const y0 = 20 + ry * 80;
      for (let y = y0; y < y0 + 30; y += 1) {
        for (let x = x0; x < x0 + 30; x += 1) {
          const i = (y * w + x) * 4;
          px[i] = s;
          px[i + 1] = s;
          px[i + 2] = s;
        }
      }
    }
  }
  return px;
}

/**
 * Goose-like trap: two-color art with 1.2% salt-and-pepper noise. The
 * damage-checked tier fails on the RAW pixels (noise snaps badly) but
 * fires on the DENOISED pixels (the median removes the noise), so the
 * image takes the binary path and the gate must stay shut even though
 * the rewrite lands in the extended band. A raw-pixel check would fire
 * here and ship a regression.
 */
function noisyTwoColor(): Uint8ClampedArray {
  const w = 128;
  const h = 128;
  const px = solidRgba(w, h, 255);
  let seed = 42;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const n = Math.floor(w * h * 0.012);
  for (let k = 0; k < n; k += 1) {
    const i = Math.floor(rnd() * w * h) * 4;
    px[i] = Math.floor(rnd() * 256);
    px[i + 1] = Math.floor(rnd() * 256);
    px[i + 2] = Math.floor(rnd() * 256);
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
  it("fires on flat art the median heavily rewrites (legacy band)", () => {
    const raw = thinBars(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(isMedianDamaging(raw, 64, 64, denoised)).toBe(true);
  });

  it("fires on color-path flat art in the extended rewrite band", () => {
    const raw = shadedArtwork();
    const denoised = medianFilter5x5(raw, 256, 256);
    expect(isMedianDamaging(raw, 256, 256, denoised)).toBe(true);
  });

  it("does not fire when the denoised pixels take the binary path", () => {
    // Goose-like: the damage check fails on the raw pixels (noise snaps
    // badly) but fires on the denoised pixels, so the image takes the
    // binary path where the median is kept. A raw-pixel check would fire
    // here and ship a regression.
    const raw = noisyTwoColor();
    const denoised = medianFilter5x5(raw, 128, 128);
    expect(isMedianDamaging(raw, 128, 128, denoised)).toBe(false);
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
    const raw = shadedArtwork();
    const denoised = medianFilter5x5(raw, 256, 256);
    expect(medianDamagePassthrough(raw, 256, 256, denoised)).toBe(raw);
  });

  it("returns null when the median is harmless", () => {
    const raw = solidRgba(32, 32, 200);
    const denoised = medianFilter5x5(raw, 32, 32);
    expect(medianDamagePassthrough(raw, 32, 32, denoised)).toBe(null);
  });
});
