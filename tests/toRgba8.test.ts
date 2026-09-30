import { describe, expect, it } from "vitest";
import { deflateSync, crc32 } from "node:zlib";
import { decode, encode } from "fast-png";
import { toRgba8 } from "@/lib/image/toRgba8";

// --- Hand-built PNG construction -------------------------------------------

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function buildPng(opts: {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  /** Filter byte + packed sample bytes, one row after another. */
  rows: Buffer;
  palette?: number[][];
  trns?: Buffer;
}): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(opts.width, 0);
  ihdr.writeUInt32BE(opts.height, 4);
  ihdr[8] = opts.bitDepth;
  ihdr[9] = opts.colorType;
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // no filter
  ihdr[12] = 0; // no interlace
  const parts = [sig, chunk("IHDR", ihdr)];
  if (opts.palette) {
    parts.push(chunk("PLTE", Buffer.from(opts.palette.flat())));
  }
  if (opts.trns) {
    parts.push(chunk("tRNS", opts.trns));
  }
  parts.push(chunk("IDAT", deflateSync(opts.rows)));
  parts.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** One row: filter byte 0 followed by the packed data bytes. */
function row(...bytes: number[]): Buffer {
  return Buffer.from([0, ...bytes]);
}

// --- Tests -----------------------------------------------------------------

describe("toRgba8", () => {
  it("passes through 8-bit RGBA unchanged", () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]);
    const encoded = encode({ width: 2, height: 1, data: pixels, depth: 8, channels: 4 });
    const rgba = toRgba8(decode(encoded));
    expect(Array.from(rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 128]);
  });

  it("expands 8-bit RGB to RGBA with opaque alpha", () => {
    const pixels = new Uint8Array([255, 0, 0, 0, 0, 255]);
    const encoded = encode({ width: 2, height: 1, data: pixels, depth: 8, channels: 3 });
    const rgba = toRgba8(decode(encoded));
    expect(Array.from(rgba)).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it("expands 8-bit grayscale to RGBA", () => {
    const pixels = new Uint8Array([0, 128, 255]);
    const encoded = encode({ width: 3, height: 1, data: pixels, depth: 8, channels: 1 });
    const rgba = toRgba8(decode(encoded));
    expect(Array.from(rgba)).toEqual([
      0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255,
    ]);
  });

  it("expands 8-bit gray+alpha to RGBA", () => {
    const pixels = new Uint8Array([255, 128]);
    const encoded = encode({ width: 1, height: 1, data: pixels, depth: 8, channels: 2 });
    const rgba = toRgba8(decode(encoded));
    expect(Array.from(rgba)).toEqual([255, 255, 255, 128]);
  });

  it("shifts 16-bit RGBA down to 8-bit", () => {
    const pixels = new Uint16Array([65535, 0, 0, 65535]);
    const encoded = encode({ width: 1, height: 1, data: pixels, depth: 16, channels: 4 });
    const rgba = toRgba8(decode(encoded));
    expect(Array.from(rgba)).toEqual([255, 0, 0, 255]);
  });

  it("maps 8-bit palette indices through the palette", () => {
    const pixels = new Uint8Array([0, 1]);
    const encoded = encode({
      width: 2, height: 1, data: pixels, depth: 8, channels: 1,
      palette: [[255, 0, 0], [0, 0, 255]],
    });
    const rgba = toRgba8(decode(encoded));
    expect(Array.from(rgba)).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it("unpacks 1-bit grayscale (black/white line art)", () => {
    // 0xAA = 10101010: white, black, white, black, ...
    const png = buildPng({
      width: 8, height: 1, bitDepth: 1, colorType: 0, rows: row(0xaa),
    });
    const rgba = toRgba8(decode(png));
    const expected: number[] = [];
    for (let i = 0; i < 8; i++) {
      const v = i % 2 === 0 ? 255 : 0;
      expected.push(v, v, v, 255);
    }
    expect(Array.from(rgba)).toEqual(expected);
  });

  it("unpacks 1-bit grayscale with row padding", () => {
    // 5 px wide: 10101 then 3 padding bits (0xA8)
    const png = buildPng({
      width: 5, height: 1, bitDepth: 1, colorType: 0, rows: row(0xa8),
    });
    const rgba = toRgba8(decode(png));
    const expected: number[] = [];
    for (const v of [255, 0, 255, 0, 255]) {
      expected.push(v, v, v, 255);
    }
    expect(Array.from(rgba)).toEqual(expected);
  });

  it("unpacks 4-bit grayscale and scales to 0-255", () => {
    // 0x0F: samples 0 and 15 -> black and white
    const png = buildPng({
      width: 2, height: 1, bitDepth: 4, colorType: 0, rows: row(0x0f),
    });
    const rgba = toRgba8(decode(png));
    expect(Array.from(rgba)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it("unpacks 1-bit palette indices", () => {
    // 0x55 = 01010101: indices 0,1,0,1,...
    const png = buildPng({
      width: 8, height: 1, bitDepth: 1, colorType: 3,
      rows: row(0x55),
      palette: [[255, 0, 0], [0, 0, 255]],
    });
    const rgba = toRgba8(decode(png));
    const expected: number[] = [];
    for (let i = 0; i < 8; i++) {
      expected.push(...(i % 2 === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
    }
    expect(Array.from(rgba)).toEqual(expected);
  });

  it("unpacks 2-bit palette indices", () => {
    // 0x1B = 00 01 10 11: indices 0,1,2,3
    const png = buildPng({
      width: 4, height: 1, bitDepth: 2, colorType: 3,
      rows: row(0x1b),
      palette: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]],
    });
    const rgba = toRgba8(decode(png));
    expect(Array.from(rgba)).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
    ]);
  });

  it("unpacks 4-bit palette indices", () => {
    // 0x12: indices 1 and 2
    const png = buildPng({
      width: 2, height: 1, bitDepth: 4, colorType: 3,
      rows: row(0x12),
      palette: [[255, 0, 0], [0, 255, 0], [0, 0, 255]],
    });
    const rgba = toRgba8(decode(png));
    expect(Array.from(rgba)).toEqual([0, 255, 0, 255, 0, 0, 255, 255]);
  });

  it("applies tRNS alpha from the palette (8-bit palette + tRNS)", () => {
    // tRNS [255, 0]: entry 0 opaque, entry 1 fully transparent
    const png = buildPng({
      width: 2, height: 1, bitDepth: 8, colorType: 3,
      rows: row(0, 1),
      palette: [[255, 0, 0], [0, 255, 0]],
      trns: Buffer.from([255, 0]),
    });
    const rgba = toRgba8(decode(png));
    expect(Array.from(rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 0]);
  });

  it("fast-png throws on RGB + tRNS (decode fallback covers it)", () => {
    // tRNS for RGB: one 16-bit sample per channel (6 bytes)
    const trns = Buffer.alloc(6);
    trns.writeUInt16BE(255, 0);
    trns.writeUInt16BE(0, 2);
    trns.writeUInt16BE(0, 4);
    const png = buildPng({
      width: 1, height: 1, bitDepth: 8, colorType: 2,
      rows: row(255, 0, 0),
      trns,
    });
    expect(() => decode(png)).toThrow();
  });

  it("fast-png throws on non-PNG bytes (decode fallback covers it)", () => {
    // JPEG magic bytes mislabeled as .png
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    expect(() => decode(jpeg)).toThrow();
  });
});
