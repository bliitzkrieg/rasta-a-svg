import { describe, expect, it } from "vitest";
import { medianFilter5x5 } from "@/lib/image/medianFilter";

function makePixels(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]) {
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

describe("medianFilter5x5", () => {
  it("removes a single-pixel speckle while keeping the rest", () => {
    const width = 5;
    const height = 5;
    const pixels = makePixels(width, height, (x, y) =>
      x === 2 && y === 2 ? [255, 0, 0, 255] : [0, 0, 0, 255]
    );

    const out = medianFilter5x5(pixels, width, height);
    const center = (2 * width + 2) * 4;
    expect(out[center]).toBe(0);
    expect(out[center + 3]).toBe(255);
  });

  it("preserves a clean sharp edge", () => {
    const width = 6;
    const height = 4;
    const pixels = makePixels(width, height, (x) =>
      x < 3 ? [0, 0, 0, 255] : [255, 255, 255, 255]
    );

    const out = medianFilter5x5(pixels, width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const expected = x < 3 ? 0 : 255;
        expect(out[i]).toBe(expected);
        expect(out[i + 1]).toBe(expected);
        expect(out[i + 2]).toBe(expected);
      }
    }
  });

  it("replicates edge pixels at borders instead of darkening them", () => {
    const width = 3;
    const height = 3;
    const pixels = makePixels(width, height, () => [200, 100, 50, 255]);

    const out = medianFilter5x5(pixels, width, height);
    expect(Array.from(out)).toEqual(Array.from(pixels));
  });

  it("returns a new buffer and leaves the input untouched", () => {
    const width = 4;
    const height = 4;
    const pixels = makePixels(width, height, (x, y) =>
      x === 1 && y === 1 ? [255, 255, 255, 255] : [10, 20, 30, 255]
    );
    const before = Array.from(pixels);

    const out = medianFilter5x5(pixels, width, height);
    expect(out).not.toBe(pixels);
    expect(Array.from(pixels)).toEqual(before);
    const center = (1 * width + 1) * 4;
    expect(out[center]).toBe(10);
  });
});
