import { describe, expect, it } from "vitest";
import { decode, encode } from "fast-png";
import { toRgba8 } from "@/lib/image/toRgba8";

describe("toRgba8", () => {
  it("passes through 8-bit RGBA unchanged", () => {
    const pixels = new Uint8Array([
      255, 0, 0, 255, // red, opaque
      0, 255, 0, 128, // green, half alpha
    ]);
    const encoded = encode({ width: 2, height: 1, data: pixels, depth: 8, channels: 4 });
    const png = decode(encoded);
    const rgba = toRgba8(png);
    expect(Array.from(rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 128]);
  });

  it("expands 8-bit RGB to RGBA with opaque alpha", () => {
    const pixels = new Uint8Array([
      255, 0, 0, // red
      0, 0, 255, // blue
    ]);
    const encoded = encode({ width: 2, height: 1, data: pixels, depth: 8, channels: 3 });
    const png = decode(encoded);
    const rgba = toRgba8(png);
    expect(Array.from(rgba)).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it("expands 8-bit grayscale to RGBA", () => {
    const pixels = new Uint8Array([0, 128, 255]);
    const encoded = encode({ width: 3, height: 1, data: pixels, depth: 8, channels: 1 });
    const png = decode(encoded);
    const rgba = toRgba8(png);
    expect(Array.from(rgba)).toEqual([
      0, 0, 0, 255,
      128, 128, 128, 255,
      255, 255, 255, 255,
    ]);
  });

  it("expands 8-bit gray+alpha to RGBA", () => {
    const pixels = new Uint8Array([255, 128]); // white, half alpha
    const encoded = encode({ width: 1, height: 1, data: pixels, depth: 8, channels: 2 });
    const png = decode(encoded);
    const rgba = toRgba8(png);
    expect(Array.from(rgba)).toEqual([255, 255, 255, 128]);
  });

  it("shifts 16-bit RGBA down to 8-bit", () => {
    // 16-bit values: 65535 -> 255, 32768 -> 128
    const pixels = new Uint16Array([65535, 0, 0, 65535]);
    const encoded = encode({ width: 1, height: 1, data: pixels, depth: 16, channels: 4 });
    const png = decode(encoded);
    const rgba = toRgba8(png);
    expect(Array.from(rgba)).toEqual([255, 0, 0, 255]);
  });

  it("maps palette indices through the palette", () => {
    const pixels = new Uint8Array([0, 1]);
    const palette = [
      [255, 0, 0], // index 0 = red
      [0, 0, 255], // index 1 = blue
    ];
    const encoded = encode({
      width: 2,
      height: 1,
      data: pixels,
      depth: 8,
      channels: 1,
      palette,
    });
    const png = decode(encoded);
    const rgba = toRgba8(png);
    expect(Array.from(rgba)).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });
});
