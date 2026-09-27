import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adaptiveMajorityVote,
  majorityVoteImageData,
  MAJORITY_VOTE_MAX_CHANGE_FRACTION,
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
      expect(out).toEqual(expected);
    }
  }, 60000);
});

describe("adaptiveMajorityVote", () => {
  it("keeps the vote on flat art and skips it on complex content", () => {
    // Flat art: vote changes almost nothing, so the voted image is kept.
    const flat = makePixels(8, 8, (x, y) =>
      x === 3 && y === 3 ? [255, 0, 0, 255] : [0, 0, 0, 255],
    );
    const flatOut = adaptiveMajorityVote(flat, 8, 8);
    const flatVoted = majorityVoteImageData(flat, 8, 8);
    expect(flatOut).toEqual(flatVoted);

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
});
