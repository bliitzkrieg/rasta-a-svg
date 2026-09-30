import type { DecodedPng } from "fast-png";

/**
 * Convert fast-png decoded output to 8-bit RGBA.
 *
 * fast-png returns raw channel data which varies by PNG type:
 * - RGBA 8-bit: 4 channels, ready to use
 * - RGB 8-bit: 3 channels (no alpha)
 * - Grayscale: 1 channel
 * - Gray+alpha: 2 channels
 * - 16-bit: values up to 65535 (must shift down)
 * - Palette (indexed): indices + separate palette array
 *
 * This was a live bug: the decode path assumed 8-bit RGBA always,
 * so RGB screenshots, grayscale images, 16-bit PNGs, and palette
 * PNGs all failed to convert.
 */
export function toRgba8(png: DecodedPng): Uint8ClampedArray {
  const { width, height, data, depth, channels } = png;
  const pixelCount = width * height;
  const out = new Uint8ClampedArray(pixelCount * 4);

  // Palette (indexed) PNG: map indices through the palette
  if (png.palette) {
    const palette = png.palette;
    const transparency = png.transparency;
    for (let i = 0; i < pixelCount; i++) {
      // For indexed PNGs, data contains palette indices
      // Handle different bit depths for the index itself
      let index: number;
      if (depth === 16) {
        index = (data as Uint16Array)[i];
      } else {
        index = (data as Uint8Array | Uint8ClampedArray)[i];
      }
      const color = palette[index] ?? [0, 0, 0];
      const o = i * 4;
      out[o] = color[0] ?? 0;
      out[o + 1] = color[1] ?? 0;
      out[o + 2] = color[2] ?? 0;
      // tRNS chunk provides per-palette-entry alpha
      out[o + 3] = transparency ? (transparency[index] ?? 255) : 255;
      // 16-bit palette entries: shift down
      if (depth === 16) {
        out[o] >>= 8;
        out[o + 1] >>= 8;
        out[o + 2] >>= 8;
        // transparency values are also 16-bit
        if (transparency) {
          out[o + 3] = Math.round(out[o + 3] / 257);
        }
      }
    }
    return out;
  }

  // Non-palette: expand channels to RGBA
  const is16Bit = depth === 16;
  const src = data as Uint8Array | Uint8ClampedArray | Uint16Array;

  // Helper to read a channel value, shifting 16-bit down to 8-bit
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
      // Check tRNS for transparent gray values
      let alpha = 255;
      if (png.transparency && png.transparency.length > 0) {
        const transparentGray = is16Bit
          ? png.transparency[0] >> 8
          : png.transparency[0];
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
