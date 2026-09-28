import { describe, expect, it } from "vitest";
import { medianFilter5x5 } from "@/lib/image/medianFilter";
import {
  countUniqueRgb,
  isThinStructure,
  thinStructurePassthrough,
} from "@/lib/image/thinStructure";

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

/** 1px black grid lines on white (every 6px), like thin line art. */
function thinLines(width: number, height: number): Uint8ClampedArray {
  const px = solidRgba(width, height, 255);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x % 6 === 0 || y % 6 === 0) {
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

describe("countUniqueRgb", () => {
  it("counts distinct RGB triples ignoring alpha", () => {
    const px = solidRgba(4, 4, 128);
    px[3] = 0; // transparent pixel, same RGB
    px[7] = 200; // different alpha, different RGB
    px[4] = 10;
    px[5] = 20;
    px[6] = 30;
    expect(countUniqueRgb(px, 4, 4)).toBe(2);
  });
});

describe("isThinStructure", () => {
  it("fires on 1px thin lines (few colors, median erases them)", () => {
    const raw = thinLines(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(isThinStructure(raw, 64, 64, denoised)).toBe(true);
  });

  it("does not fire on flat art the median leaves alone", () => {
    const raw = solidRgba(32, 32, 200);
    const denoised = medianFilter5x5(raw, 32, 32);
    expect(isThinStructure(raw, 32, 32, denoised)).toBe(false);
  });

  it("does not fire on many-colored content even when the median changes a lot", () => {
    // Many distinct colors: the color count proves it is texture, not
    // thin structure, so the gate stays shut.
    const raw = manyColors(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(countUniqueRgb(raw, 64, 64)).toBeGreaterThan(8);
    expect(isThinStructure(raw, 64, 64, denoised)).toBe(false);
  });
});

describe("thinStructurePassthrough", () => {
  it("returns the raw pixels when thin structures are detected", () => {
    const raw = thinLines(64, 64);
    const denoised = medianFilter5x5(raw, 64, 64);
    expect(thinStructurePassthrough(raw, 64, 64, denoised)).toBe(raw);
  });

  it("returns null for ordinary content", () => {
    const raw = solidRgba(32, 32, 200);
    const denoised = medianFilter5x5(raw, 32, 32);
    expect(thinStructurePassthrough(raw, 32, 32, denoised)).toBeNull();
  });
});
