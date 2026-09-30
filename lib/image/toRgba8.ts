import type { DecodedPng } from "fast-png";

/**
 * Convert fast-png decoded output to 8-bit RGBA.
 *
 * fast-png returns raw channel data which varies by PNG type. Depths below
 * 8 bits arrive still packed (data.length is the byte count, not the pixel
 * count), with each row padded to a whole byte. Indexed PNGs carry their
 * tRNS alpha merged into the palette entries as [r, g, b, a].
 */
export function toRgba8(png: DecodedPng): Uint8ClampedArray {
  const { width, height, data, depth, channels } = png;
  const pixelCount = width * height;
  const out = new Uint8ClampedArray(pixelCount * 4);

  // Sub-8-bit depths: unpack bits first (MSB-first, rows padded to a byte).
  const packed =
    depth === 1 || depth === 2 || depth === 4
      ? unpackBits(data as Uint8Array | Uint8ClampedArray, width, height, depth)
      : null;

  // Palette (indexed) PNG: map indices through the palette
  if (png.palette) {
    const palette = png.palette;
    const transparency = png.transparency;
    for (let i = 0; i < pixelCount; i++) {
      const index = packed ? packed[i] : readSample(data, i, depth);
      const color = palette[index] ?? [0, 0, 0];
      const o = i * 4;
      out[o] = color[0] ?? 0;
      out[o + 1] = color[1] ?? 0;
      out[o + 2] = color[2] ?? 0;
      // fast-png merges tRNS into the palette as [r, g, b, a]; fall back to
      // the raw transparency array, then to opaque.
      out[o + 3] =
        color[3] ?? (transparency ? (transparency[index] ?? 255) : 255);
    }
    return out;
  }

  // Grayscale with sub-8-bit depth: scale samples to 0-255
  if (channels === 1 && packed) {
    const scale = 255 / ((1 << depth) - 1);
    let transparentGray = -1;
    if (png.transparency && png.transparency.length > 0) {
      const tRaw = png.transparency[0];
      const maxSample = (1 << depth) - 1;
      const tSample = tRaw > maxSample ? tRaw >> 8 : tRaw;
      transparentGray = Math.round(tSample * scale);
    }
    for (let i = 0; i < pixelCount; i++) {
      const gray = Math.round(packed[i] * scale);
      const o = i * 4;
      out[o] = gray;
      out[o + 1] = gray;
      out[o + 2] = gray;
      out[o + 3] = gray === transparentGray ? 0 : 255;
    }
    return out;
  }

  // Non-palette, 8/16-bit: expand channels to RGBA
  const is16Bit = depth === 16;
  const src = data as Uint8Array | Uint8ClampedArray | Uint16Array;
  const readChannel = (idx: number): number => {
    const v = src[idx];
    return is16Bit ? v >> 8 : v;
  };

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const s = i * channels;

    if (channels === 1) {
      // Grayscale: R=G=B=gray
      const gray = readChannel(s);
      let alpha = 255;
      if (png.transparency && png.transparency.length > 0) {
        const t = png.transparency[0];
        const transparentGray = t > 255 ? t >> 8 : t;
        if (gray === transparentGray) alpha = 0;
      }
      out[o] = gray;
      out[o + 1] = gray;
      out[o + 2] = gray;
      out[o + 3] = alpha;
    } else if (channels === 2) {
      // Gray+alpha
      const gray = readChannel(s);
      const alpha = readChannel(s + 1);
      out[o] = gray;
      out[o + 1] = gray;
      out[o + 2] = gray;
      out[o + 3] = alpha;
    } else if (channels === 3) {
      // RGB (no alpha)
      out[o] = readChannel(s);
      out[o + 1] = readChannel(s + 1);
      out[o + 2] = readChannel(s + 2);
      out[o + 3] = 255;
    } else {
      // RGBA (4 channels)
      out[o] = readChannel(s);
      out[o + 1] = readChannel(s + 1);
      out[o + 2] = readChannel(s + 2);
      out[o + 3] = readChannel(s + 3);
    }
  }

  return out;
}

/** Read one sample, shifting 16-bit down to 8-bit. */
function readSample(
  data: Uint8Array | Uint8ClampedArray | Uint16Array,
  i: number,
  depth: number,
): number {
  const v = data[i];
  return depth === 16 ? v >> 8 : v;
}

/**
 * Unpack MSB-first packed samples (depth 1/2/4). Each row is padded to a
 * whole byte; padding bits are ignored.
 */
function unpackBits(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  depth: 1 | 2 | 4,
): Uint8Array {
  const rowBytes = Math.ceil((width * depth) / 8);
  const mask = (1 << depth) - 1;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    for (let x = 0; x < width; x++) {
      const bitIndex = x * depth;
      const byteIndex = rowStart + (bitIndex >> 3);
      const shift = 8 - depth - (bitIndex & 7);
      out[y * width + x] = (data[byteIndex] >> shift) & mask;
    }
  }
  return out;
}
