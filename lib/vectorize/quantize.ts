interface PaletteResult {
  palette: string[];
  labels: Uint8Array;
  counts: Uint32Array;
}

const TRANSPARENT_LABEL = 255;

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseHex(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [
    Number.parseInt(v.slice(0, 2), 16),
    Number.parseInt(v.slice(2, 4), 16),
    Number.parseInt(v.slice(4, 6), 16)
  ];
}

function choosePaletteSize(pixelCount: number): number {
  if (pixelCount < 12_000) {
    return 4;
  }
  if (pixelCount < 90_000) {
    return 8;
  }
  return 10;
}

function collectOpaqueIndices(pixels: Uint8ClampedArray, totalPixels: number): Uint32Array {
  const tmp: number[] = [];
  for (let i = 0; i < totalPixels; i += 1) {
    if (pixels[i * 4 + 3] >= 8) {
      tmp.push(i);
    }
  }
  return Uint32Array.from(tmp);
}

function makeSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sqDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function deterministicKmeansPlusPlusSeeds(
  pixels: Uint8ClampedArray,
  opaqueIndices: Uint32Array,
  k: number,
  width: number,
  height: number
): Array<[number, number, number]> {
  const centroids: Array<[number, number, number]> = [];
  if (opaqueIndices.length === 0) {
    return new Array(k).fill(null).map(() => [0, 0, 0] as [number, number, number]);
  }
  const rnd = makeSeededRandom((width * 73856093) ^ (height * 19349663) ^ (k * 83492791));
  const firstOpaque = opaqueIndices[Math.floor(rnd() * opaqueIndices.length)];
  {
    const p = firstOpaque * 4;
    centroids.push([pixels[p], pixels[p + 1], pixels[p + 2]]);
  }

  const distances = new Float64Array(opaqueIndices.length);
  for (let c = 1; c < k; c += 1) {
    let sum = 0;
    for (let i = 0; i < opaqueIndices.length; i += 1) {
      const idx = opaqueIndices[i];
      const p = idx * 4;
      const point: [number, number, number] = [pixels[p], pixels[p + 1], pixels[p + 2]];
      let minD = Number.POSITIVE_INFINITY;
      for (const centroid of centroids) {
        minD = Math.min(minD, sqDistance(point, centroid));
      }
      distances[i] = minD;
      sum += minD;
    }

    if (sum <= 0) {
      const fallback = opaqueIndices[Math.floor(rnd() * opaqueIndices.length)];
      const p = fallback * 4;
      centroids.push([pixels[p], pixels[p + 1], pixels[p + 2]]);
      continue;
    }

    let target = rnd() * sum;
    let chosen = opaqueIndices[0];
    for (let i = 0; i < opaqueIndices.length; i += 1) {
      target -= distances[i];
      if (target <= 0) {
        chosen = opaqueIndices[i];
        break;
      }
    }
    const p = chosen * 4;
    centroids.push([pixels[p], pixels[p + 1], pixels[p + 2]]);
  }
  return centroids;
}

export function quantizeImage(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  requestedSize: number,
  autoMode: boolean
): PaletteResult {
  const size = autoMode
    ? choosePaletteSize(width * height)
    : Math.max(2, Math.min(16, Math.floor(requestedSize)));

  const totalPixels = width * height;
  const opaqueIndices = collectOpaqueIndices(pixels, totalPixels);
  const centroids = deterministicKmeansPlusPlusSeeds(pixels, opaqueIndices, size, width, height);

  const labels = new Uint8Array(totalPixels);
  labels.fill(TRANSPARENT_LABEL);
  const counts = new Uint32Array(size);
  const iterations = 10;

  for (let iter = 0; iter < iterations; iter += 1) {
    const sum = new Array(size).fill(null).map(() => [0, 0, 0, 0]);

    for (let i = 0; i < totalPixels; i += 1) {
      const p = i * 4;
      const a = pixels[p + 3];
      if (a < 8) {
        labels[i] = TRANSPARENT_LABEL;
        continue;
      }
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let c = 0; c < size; c += 1) {
        const [cr, cg, cb] = centroids[c];
        const dr = pixels[p] - cr;
        const dg = pixels[p + 1] - cg;
        const db = pixels[p + 2] - cb;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      labels[i] = best;
      sum[best][0] += pixels[p];
      sum[best][1] += pixels[p + 1];
      sum[best][2] += pixels[p + 2];
      sum[best][3] += 1;
    }

    for (let c = 0; c < size; c += 1) {
      const n = sum[c][3];
      if (n > 0) {
        centroids[c] = [sum[c][0] / n, sum[c][1] / n, sum[c][2] / n];
      }
    }
  }

  const palette = centroids.map(([r, g, b]) => rgbToHex(Math.round(r), Math.round(g), Math.round(b)));

  if (palette.length > 1) {
    const indexed = palette.map((hex, idx) => ({
      idx,
      rgb: parseHex(hex)
    }));
    indexed.sort((a, b) => {
      const lumA = a.rgb[0] * 0.299 + a.rgb[1] * 0.587 + a.rgb[2] * 0.114;
      const lumB = b.rgb[0] * 0.299 + b.rgb[1] * 0.587 + b.rgb[2] * 0.114;
      return lumA - lumB;
    });
    const remap = new Map<number, number>();
    indexed.forEach((entry, sortedIndex) => remap.set(entry.idx, sortedIndex));
    for (let i = 0; i < labels.length; i += 1) {
      if (labels[i] === TRANSPARENT_LABEL) {
        continue;
      }
      labels[i] = remap.get(labels[i]) ?? labels[i];
    }
    const sortedPalette = indexed.map((entry) => rgbToHex(...entry.rgb));
    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i];
      if (label !== TRANSPARENT_LABEL && label < counts.length) {
        counts[label] += 1;
      }
    }
    return { palette: sortedPalette, labels, counts };
  }

  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i];
    if (label !== TRANSPARENT_LABEL && label < counts.length) {
      counts[label] += 1;
    }
  }
  return { palette, labels, counts };
}
