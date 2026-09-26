import { describe, expect, it } from "vitest";
import { COMPOSITE_ALPHA_GATE, compositeAlphaOverWhite } from "@/lib/image/alphaComposite";

function rgba(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  }
  return px;
}

describe("compositeAlphaOverWhite", () => {
  it("exposes a 5 percent partial-alpha gate", () => {
    expect(COMPOSITE_ALPHA_GATE).toBe(0.05);
  });

  it("leaves near-opaque images untouched (gate closed)", () => {
    // 4% partial alpha: below the gate, output must equal input.
    const px = rgba(50, 10, (x) => (x < 2 ? [200, 100, 50, 128] : [10, 20, 30, 255]));
    const out = compositeAlphaOverWhite(px, 50, 10);
    expect(Array.from(out)).toEqual(Array.from(px));
  });

  it("composites partial alpha over white when the gate opens", () => {
    // 10% partial alpha: gate opens. (200,100,50,128) blends as
    // (200*128 + 255*127)/255 = 227.39 -> 227, and so on per channel.
    const px = rgba(10, 10, (x) => (x < 1 ? [200, 100, 50, 128] : [10, 20, 30, 255]));
    const out = compositeAlphaOverWhite(px, 10, 10);
    expect(out[0]).toBe(227);
    expect(out[1]).toBe(177);
    expect(out[2]).toBe(152);
    expect(out[3]).toBe(255);
    // Opaque pixels untouched.
    expect(out[4]).toBe(10);
    expect(out[7]).toBe(255);
  });

  it("keeps fully transparent pixels transparent for background keying", () => {
    const px = rgba(10, 10, (x, y) => (y < 1 ? [0, 0, 0, 0] : [200, 100, 50, 128]));
    const out = compositeAlphaOverWhite(px, 10, 10);
    for (let x = 0; x < 10; x += 1) {
      expect(out[x * 4 + 3]).toBe(0);
    }
    // The translucent rows still composite.
    expect(out[10 * 4 + 3]).toBe(255);
  });

  it("rounds blended values to the nearest integer", () => {
    // rgb 0 at alpha 128 blends to exactly 255*127/255 = 127.
    const px = rgba(10, 10, () => [0, 0, 0, 128]);
    const out = compositeAlphaOverWhite(px, 10, 10);
    expect(out[0]).toBe(127);
    // rgb 1 at alpha 128: (128 + 255*127)/255 = 127.50 -> 128.
    const px2 = rgba(10, 10, () => [1, 0, 0, 128]);
    const out2 = compositeAlphaOverWhite(px2, 10, 10);
    expect(out2[0]).toBe(128);
  });

  it("does not mutate the input", () => {
    const px = rgba(10, 10, () => [200, 100, 50, 128]);
    const snapshot = Array.from(px);
    compositeAlphaOverWhite(px, 10, 10);
    expect(Array.from(px)).toEqual(snapshot);
  });

  it("handles empty input", () => {
    const out = compositeAlphaOverWhite(new Uint8ClampedArray(0), 0, 0);
    expect(out.length).toBe(0);
  });
});
