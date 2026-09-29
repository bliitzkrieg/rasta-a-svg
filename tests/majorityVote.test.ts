import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adaptiveMajorityVote,
  majorityVoteImageData,
  MAJORITY_VOTE_MAX_CHANGE_FRACTION,
  MAJORITY_VOTE_MAX_COLOR_SHIFT,
} from "@/lib/image/majorityVote";

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

describe("majorityVoteImageData", () => {
  it("removes a single-pixel outlier while keeping the rest", () => {
    const width = 5;
    const height = 5;
    const pixels = makePixels(width, height, (x, y) =>
      x === 2 && y === 2 ? [255, 0, 0, 255] : [0, 0, 0, 255],
    );
    const out = majorityVoteImageData(pixels, width, height);
    const center = (2 * width + 2) * 4;
    // The red speckle has 1 vote vs 8 black: replaced by black.
    expect(out[center]).toBe(0);
    expect(out[center + 1]).toBe(0);
    expect(out[center + 2]).toBe(0);
    expect(out[center + 3]).toBe(255);
  });

  it("preserves a clean sharp edge", () => {
    const width = 6;
    const height = 4;
    const pixels = makePixels(width, height, (x) =>
      x < 3 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    const out = majorityVoteImageData(pixels, width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const expected = x < 3 ? 0 : 255;
        expect(out[i]).toBe(expected);
        expect(out[i + 1]).toBe(expected);
        expect(out[i + 2]).toBe(expected);
        expect(out[i + 3]).toBe(255);
      }
    }
  });

  it("passes alpha through untouched", () => {
    const width = 3;
    const height = 3;
    const pixels = makePixels(3, 3, () => [10, 20, 30, 128]);
    // Make the center an outlier in RGB but keep its alpha.
    const center = (1 * width + 1) * 4;
    pixels[center] = 200;
    pixels[center + 1] = 210;
    pixels[center + 2] = 220;
    const out = majorityVoteImageData(pixels, width, height);
    expect(out[center]).toBe(10);
    expect(out[center + 1]).toBe(20);
    expect(out[center + 2]).toBe(30);
    expect(out[center + 3]).toBe(128);
  });

  it("matches the parity harness byte-identically on real images", () => {
    for (const name of ["diagonal_text.png", "thin_lines.png", "photo.png"]) {
      const [w, h] = readFileSync(`/tmp/mv_${name}.size`, "utf8")
        .trim()
        .split(" ")
        .map(Number);
      const input = new Uint8ClampedArray(
        readFileSync(`/tmp/mv_${name}.in.rgba`).buffer,
      );
      const expected = new Uint8ClampedArray(
        readFileSync(`/tmp/mv_${name}.out.rgba`).buffer,
      );
      const out = majorityVoteImageData(input, w, h);
      expect(out.length).toBe(expected.length);
      // Manual byte loop: vitest's toEqual is pathologically slow on
      // large typed arrays; a loop is milliseconds.
      let firstBad = -1;
      for (let i = 0; i < out.length; i++) {
        if (out[i] !== expected[i]) {
          firstBad = i;
          break;
        }
      }
      expect(firstBad).toBe(-1);
    }
  }, 60000);
});

describe("adaptiveMajorityVote", () => {
  it("keeps the vote on flat art and skips it on complex content", () => {
    // Flat art: vote changes almost nothing, so the voted image is kept,
    // except the lone red outlier, whose 255-shift repaint is reverted by
    // the color-shift cap (it keeps its red).
    const flat = makePixels(8, 8, (x, y) =>
      x === 3 && y === 3 ? [255, 0, 0, 255] : [0, 0, 0, 255],
    );
    const flatOut = adaptiveMajorityVote(flat, 8, 8);
    const flatVoted = majorityVoteImageData(flat, 8, 8);
    const center = (3 * 8 + 3) * 4;
    expect(flatOut[center]).toBe(255);
    expect(flatOut[center + 1]).toBe(0);
    // All other pixels match the voted image.
    for (let i = 0; i < flatOut.length; i += 1) {
      if (i >= center && i < center + 4) continue;
      expect(flatOut[i]).toBe(flatVoted[i]);
    }

    // Noise: every pixel differs from its neighbors, so the vote would
    // repaint everything; the original must be kept instead.
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % 256;
    };
    const noisy = makePixels(32, 32, () => [rand(), rand(), rand(), 255]);
    const noisyOut = adaptiveMajorityVote(noisy, 32, 32);
    expect(noisyOut).toEqual(noisy);
  });

  it("exposes a 0.10 change-fraction gate", () => {
    expect(MAJORITY_VOTE_MAX_CHANGE_FRACTION).toBe(0.1);
  });

  it("reverts vote moves larger than the color-shift cap, keeps small ones", () => {
    expect(MAJORITY_VOTE_MAX_COLOR_SHIFT).toBe(24);
    // A lone red outlier on black: the vote would repaint it black
    // (shift 255), so the guard reverts it to red.
    const pixels = makePixels(8, 8, (x, y) =>
      x === 3 && y === 3 ? [255, 0, 0, 255] : [0, 0, 0, 255],
    );
    const out = adaptiveMajorityVote(pixels, 8, 8);
    const center = (3 * 8 + 3) * 4;
    expect(out[center]).toBe(255);
    expect(out[center + 1]).toBe(0);
    expect(out[center + 2]).toBe(0);
    expect(out[center + 3]).toBe(255);
    // Everywhere else the vote's smoothing is preserved (all black here).
    const corner = 0;
    expect(out[corner]).toBe(0);

    // A near-background outlier: the vote nudges it by 5 (within the cap),
    // so the voted color is kept.
    const near = makePixels(8, 8, (x, y) =>
      x === 3 && y === 3 ? [250, 0, 0, 255] : [255, 0, 0, 255],
    );
    const nearOut = adaptiveMajorityVote(near, 8, 8);
    expect(nearOut[center]).toBe(255);
    expect(nearOut[center + 3]).toBe(255);
  });
});
