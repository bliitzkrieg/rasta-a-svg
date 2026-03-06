#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

function parseArgs(argv) {
  const out = {
    input: "example/input",
    output: "example/generated",
    paletteSize: 16,
    simplifyTolerance: 0.9,
    smoothing: 0.1,
    speckleThreshold: 6,
    cornerThreshold: 22,
    minLayerCoveragePct: 0.003,
    maxPathsPerLayer: 6,
    minLayerCount: 5,
    maxLayerCount: 8,
    targetPathsPerLayer: 4.25
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key.startsWith("--")) {
      continue;
    }
    const name = key.slice(2);
    if (name in out && value && !value.startsWith("--")) {
      out[name] = Number.isNaN(Number(value)) ? value : Number(value);
      i += 1;
    }
  }
  return out;
}

function readUInt32BE(buf, offset) {
  return (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

function decodePng(filePath) {
  const data = fs.readFileSync(filePath);
  const signature = "89504e470d0a1a0a";
  if (data.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`Invalid PNG signature: ${filePath}`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette = null;
  let transparentColor = null;
  const idat = [];

  while (offset < data.length) {
    const length = readUInt32BE(data, offset);
    const type = data.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = readUInt32BE(chunk, 0);
      height = readUInt32BE(chunk, 4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      interlace = chunk[12];
    } else if (type === "PLTE") {
      palette = chunk;
    } else if (type === "tRNS") {
      transparentColor = chunk;
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) {
    throw new Error(`Unsupported bit depth ${bitDepth} in ${filePath}`);
  }
  if (interlace !== 0) {
    throw new Error(`Interlaced PNG unsupported in ${filePath}`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : 0;
  if (!bytesPerPixel) {
    throw new Error(`Unsupported color type ${colorType} in ${filePath}`);
  }

  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bytesPerPixel;
  const raw = Buffer.alloc(height * stride);
  let inOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[inOffset++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = inflated[inOffset++];
      const left = x >= bytesPerPixel ? raw[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? raw[rowStart + x - stride] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? raw[rowStart + x - stride - bytesPerPixel] : 0;
      let value = rawByte;
      if (filterType === 1) {
        value = (rawByte + left) & 255;
      } else if (filterType === 2) {
        value = (rawByte + up) & 255;
      } else if (filterType === 3) {
        value = (rawByte + Math.floor((left + up) / 2)) & 255;
      } else if (filterType === 4) {
        value = (rawByte + paeth(left, up, upLeft)) & 255;
      }
      raw[rowStart + x] = value;
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  if (colorType === 6) {
    rgba.set(raw);
  } else if (colorType === 2) {
    for (let i = 0, j = 0; i < raw.length; i += 3, j += 4) {
      rgba[j] = raw[i];
      rgba[j + 1] = raw[i + 1];
      rgba[j + 2] = raw[i + 2];
      rgba[j + 3] = 255;
    }
  } else if (colorType === 3 && palette) {
    for (let i = 0, j = 0; i < raw.length; i += 1, j += 4) {
      const idx = raw[i];
      rgba[j] = palette[idx * 3] || 0;
      rgba[j + 1] = palette[idx * 3 + 1] || 0;
      rgba[j + 2] = palette[idx * 3 + 2] || 0;
      rgba[j + 3] = transparentColor && transparentColor[idx] !== undefined ? transparentColor[idx] : 255;
    }
  }

  return { width, height, pixels: rgba };
}

function resizeBilinear(image, maxDim = 1000) {
  const scale = Math.min(1, maxDim / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  if (w === image.width && h === image.height) {
    return image;
  }
  const out = new Uint8ClampedArray(w * h * 4);
  const xRatio = image.width / w;
  const yRatio = image.height / h;
  for (let y = 0; y < h; y += 1) {
    const sy = (y + 0.5) * yRatio - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(image.height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < w; x += 1) {
      const sx = (x + 0.5) * xRatio - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(image.width - 1, x0 + 1);
      const fx = sx - x0;

      for (let c = 0; c < 4; c += 1) {
        const p00 = image.pixels[(y0 * image.width + x0) * 4 + c];
        const p10 = image.pixels[(y0 * image.width + x1) * 4 + c];
        const p01 = image.pixels[(y1 * image.width + x0) * 4 + c];
        const p11 = image.pixels[(y1 * image.width + x1) * 4 + c];
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out[(y * w + x) * 4 + c] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  return { width: w, height: h, pixels: out };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function makeSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hexLuminance(hex) {
  const v = hex.replace("#", "");
  const r = Number.parseInt(v.slice(0, 2), 16) || 0;
  const g = Number.parseInt(v.slice(2, 4), 16) || 0;
  const b = Number.parseInt(v.slice(4, 6), 16) || 0;
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function parseHexColor(hex) {
  const v = hex.replace("#", "");
  return {
    r: Number.parseInt(v.slice(0, 2), 16) || 0,
    g: Number.parseInt(v.slice(2, 4), 16) || 0,
    b: Number.parseInt(v.slice(4, 6), 16) || 0
  };
}

function calibrateOutputColor(hex) {
  const { r, g, b } = parseHexColor(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const sat = max === 0 ? 0 : chroma / max;
  const lum = r * 0.299 + g * 0.587 + b * 0.114;

  let hue = 0;
  if (chroma > 0) {
    if (max === r) {
      hue = ((g - b) / chroma) % 6;
    } else if (max === g) {
      hue = (b - r) / chroma + 2;
    } else {
      hue = (r - g) / chroma + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  if (lum < 55) return "#000000";
  if (lum > 232 && sat < 0.18) return "#fffdff";
  if (lum > 210 && sat < 0.35 && Math.abs(r - g) < 35 && Math.abs(g - b) < 35) return "#fffdff";
  if (lum > 180 && lum <= 232 && sat >= 0.12 && sat < 0.45 && r >= g && g >= b && hue <= 35) return "#fad9cd";
  if (sat > 0.45 && hue >= 20 && hue <= 55) return "#fab53c";
  if (sat > 0.35 && (hue <= 20 || hue >= 340)) return "#f55255";
  return hex;
}

function mergeLikeColoredLayers(layers) {
  const byColor = new Map();
  for (const layer of layers) {
    const existing = byColor.get(layer.color);
    if (!existing) {
      byColor.set(layer.color, { ...layer, paths: [...layer.paths] });
      continue;
    }
    existing.paths.push(...layer.paths);
  }
  return Array.from(byColor.values());
}

function quantizeImage(pixels, width, height, size) {
  const total = width * height;
  const opaque = [];
  for (let i = 0; i < total; i += 1) {
    if (pixels[i * 4 + 3] >= 8) {
      opaque.push(i);
    }
  }
  if (!opaque.length) {
    return {
      palette: new Array(size).fill("#000000"),
      labels: new Uint8Array(total),
      counts: new Uint32Array(size)
    };
  }
  const centroids = [];
  const rnd = makeSeededRandom((width * 73856093) ^ (height * 19349663) ^ (size * 83492791));
  {
    const first = opaque[Math.floor(rnd() * opaque.length)] * 4;
    centroids.push([pixels[first], pixels[first + 1], pixels[first + 2]]);
  }
  const distances = new Float64Array(opaque.length);
  for (let c = 1; c < size; c += 1) {
    let sum = 0;
    for (let i = 0; i < opaque.length; i += 1) {
      const p = opaque[i] * 4;
      let minD = Infinity;
      for (const [cr, cg, cb] of centroids) {
        const dr = pixels[p] - cr;
        const dg = pixels[p + 1] - cg;
        const db = pixels[p + 2] - cb;
        const d = dr * dr + dg * dg + db * db;
        if (d < minD) {
          minD = d;
        }
      }
      distances[i] = minD;
      sum += minD;
    }
    if (sum <= 0) {
      const fallback = opaque[Math.floor(rnd() * opaque.length)] * 4;
      centroids.push([pixels[fallback], pixels[fallback + 1], pixels[fallback + 2]]);
      continue;
    }
    let target = rnd() * sum;
    let chosen = opaque[0];
    for (let i = 0; i < opaque.length; i += 1) {
      target -= distances[i];
      if (target <= 0) {
        chosen = opaque[i];
        break;
      }
    }
    const p = chosen * 4;
    centroids.push([pixels[p], pixels[p + 1], pixels[p + 2]]);
  }

  const labels = new Uint8Array(total);
  const counts = new Uint32Array(size);
  for (let iter = 0; iter < 10; iter += 1) {
    const sums = new Array(size).fill(0).map(() => [0, 0, 0, 0]);
    for (let i = 0; i < total; i += 1) {
      const p = i * 4;
      if (pixels[p + 3] < 8) {
        labels[i] = 0;
        continue;
      }
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < size; c += 1) {
        const [cr, cg, cb] = centroids[c];
        const dr = pixels[p] - cr;
        const dg = pixels[p + 1] - cg;
        const db = pixels[p + 2] - cb;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      labels[i] = best;
      sums[best][0] += pixels[p];
      sums[best][1] += pixels[p + 1];
      sums[best][2] += pixels[p + 2];
      sums[best][3] += 1;
    }
    for (let c = 0; c < size; c += 1) {
      if (sums[c][3] > 0) {
        centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
  }
  for (let i = 0; i < labels.length; i += 1) {
    counts[labels[i]] += 1;
  }
  return {
    palette: centroids.map(([r, g, b]) => rgbToHex(Math.round(r), Math.round(g), Math.round(b))),
    labels,
    counts
  };
}

function labelsToMask(labels, index) {
  const mask = new Uint8Array(labels.length);
  for (let i = 0; i < labels.length; i += 1) {
    mask[i] = labels[i] === index ? 1 : 0;
  }
  return mask;
}

function removeSmallComponents(mask, width, minPixels) {
  const out = new Uint8Array(mask);
  const visited = new Uint8Array(mask.length);
  const dirs = [1, -1, width, -width];
  for (let i = 0; i < out.length; i += 1) {
    if (!out[i] || visited[i]) {
      continue;
    }
    const q = [i];
    const comp = [];
    visited[i] = 1;
    while (q.length) {
      const cur = q.pop();
      comp.push(cur);
      const x = cur % width;
      for (const d of dirs) {
        const n = cur + d;
        if (n < 0 || n >= out.length || visited[n] || !out[n]) {
          continue;
        }
        if ((d === 1 && x === width - 1) || (d === -1 && x === 0)) {
          continue;
        }
        visited[n] = 1;
        q.push(n);
      }
    }
    if (comp.length < minPixels) {
      for (const idx of comp) {
        out[idx] = 0;
      }
    }
  }
  return out;
}

function isBackgroundFlood(mask, width, height) {
  let count = 0;
  let top = false;
  let bottom = false;
  let left = false;
  let right = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx]) {
        continue;
      }
      count += 1;
      if (y === 0) top = true;
      if (y === height - 1) bottom = true;
      if (x === 0) left = true;
      if (x === width - 1) right = true;
    }
  }
  const coverage = count / (width * height);
  return coverage > 0.25 && top && bottom && left && right;
}

function maskToPolygons(mask, width, height) {
  const edges = [];
  const key = (p) => `${p.x},${p.y}`;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx]) {
        continue;
      }
      const top = y === 0 || !mask[idx - width];
      const right = x === width - 1 || !mask[idx + 1];
      const bottom = y === height - 1 || !mask[idx + width];
      const left = x === 0 || !mask[idx - 1];
      if (top) {
        edges.push({ start: { x, y }, end: { x: x + 1, y } });
      }
      if (right) {
        edges.push({ start: { x: x + 1, y }, end: { x: x + 1, y: y + 1 } });
      }
      if (bottom) {
        edges.push({ start: { x: x + 1, y: y + 1 }, end: { x, y: y + 1 } });
      }
      if (left) {
        edges.push({ start: { x, y: y + 1 }, end: { x, y } });
      }
    }
  }

  const byStart = new Map();
  for (const e of edges) {
    const k = key(e.start);
    const v = byStart.get(k) || [];
    v.push(e);
    byStart.set(k, v);
  }
  const polygons = [];
  while (byStart.size > 0) {
    const [startKey, startEdges] = byStart.entries().next().value;
    const edge = startEdges.pop();
    if (!startEdges.length) {
      byStart.delete(startKey);
    }
    const loop = [edge.start, edge.end];
    let cur = edge.end;
    let guard = 0;
    while (guard < 1_000_000) {
      guard += 1;
      const k = key(cur);
      const nextEdges = byStart.get(k);
      if (!nextEdges || !nextEdges.length) {
        break;
      }
      const next = nextEdges.pop();
      if (!nextEdges.length) {
        byStart.delete(k);
      }
      cur = next.end;
      if (cur.x === loop[0].x && cur.y === loop[0].y) {
        break;
      }
      loop.push(cur);
    }
    if (loop.length >= 4) {
      polygons.push(loop);
    }
  }
  return polygons;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!dx && !dy) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / Math.hypot(dx, dy);
}

function douglasPeucker(points, epsilon) {
  if (points.length < 3) {
    return points;
  }
  let idx = 0;
  let max = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = distToSegment(points[i], points[0], points[points.length - 1]);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max > epsilon) {
    const left = douglasPeucker(points.slice(0, idx + 1), epsilon);
    const right = douglasPeucker(points.slice(idx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

function angleAt(prev, cur, next) {
  const ax = prev.x - cur.x;
  const ay = prev.y - cur.y;
  const bx = next.x - cur.x;
  const by = next.y - cur.y;
  const dot = ax * bx + ay * by;
  const mag = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (!mag) {
    return 180;
  }
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

function simplifyPath(points, tolerance, smoothing, cornerThreshold) {
  const closed = [...points, points[0]];
  const simplified = douglasPeucker(closed, Math.max(0.4, tolerance)).slice(0, -1);
  if (simplified.length < 4 || smoothing <= 0) {
    return simplified;
  }
  const out = [simplified[0]];
  for (let i = 1; i < simplified.length - 1; i += 1) {
    const prev = simplified[i - 1];
    const cur = simplified[i];
    const next = simplified[i + 1];
    if (angleAt(prev, cur, next) < cornerThreshold) {
      out.push(cur);
    } else {
      out.push({
        x: cur.x * (1 - smoothing) + (prev.x + next.x) * 0.5 * smoothing,
        y: cur.y * (1 - smoothing) + (prev.y + next.y) * 0.5 * smoothing
      });
    }
  }
  out.push(simplified[simplified.length - 1]);
  return out;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
}


function alphaHex(opacity) {
  return Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");
}

function toBezier(points) {
  if (points.length < 4) {
    const first = points[0];
    const body = points.slice(1).map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${body} Z`;
  }
  const n = points.length;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} `;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
  }
  return `${d}Z`;
}

function toSVG(result) {
  const groups = result.layers
    .map((layer) => {
      const opacity = 1;
      const id = `${layer.color}${alphaHex(opacity)}`;
      const paths = layer.paths
        .map((p) => `<path fill="${layer.color}" opacity="${opacity.toFixed(2)}" d=" ${toBezier(p.points)}" />`)
        .join("\n");
      return `<g id="${id}">\n${paths}\n</g>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg width="${result.width}pt" height="${result.height}pt" viewBox="0 0 ${result.width} ${result.height}" version="1.1" xmlns="http://www.w3.org/2000/svg">\n${groups}\n</svg>\n`;
}

function toEPS(result) {
  const lines = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    `%%BoundingBox: 0 0 ${Math.ceil(result.width)} ${Math.ceil(result.height)}`,
    "%%LanguageLevel: 2",
    "%%Pages: 1",
    "%%EndComments",
    "gsave",
    `0 ${result.height} translate`,
    "1 -1 scale"
  ];
  for (const layer of result.layers) {
    const hex = layer.color.replace("#", "");
    const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
    const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
    const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
    lines.push(`% Layer: ${layer.name}`);
    lines.push(`${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} setrgbcolor`);
    for (const p of layer.paths) {
      if (!p.points.length) {
        continue;
      }
      lines.push("newpath");
      lines.push(`${p.points[0].x.toFixed(2)} ${p.points[0].y.toFixed(2)} moveto`);
      for (let i = 1; i < p.points.length; i += 1) {
        lines.push(`${p.points[i].x.toFixed(2)} ${p.points[i].y.toFixed(2)} lineto`);
      }
      lines.push("closepath fill");
    }
  }
  lines.push("grestore", "showpage", "%%EOF");
  return `${lines.join("\n")}\n`;
}

function toDXF(result) {
  const lines = [];
  const add = (c, v) => {
    lines.push(String(c), String(v));
  };
  add(0, "SECTION");
  add(2, "HEADER");
  add(0, "ENDSEC");
  add(0, "SECTION");
  add(2, "TABLES");
  add(0, "TABLE");
  add(2, "LAYER");
  add(70, result.layers.length + 1);
  add(0, "LAYER");
  add(2, "0");
  add(70, 0);
  add(62, 7);
  add(6, "CONTINUOUS");
  result.layers.forEach((layer, i) => {
    add(0, "LAYER");
    add(2, layer.name);
    add(70, 0);
    add(62, (i % 255) + 1);
    add(6, "CONTINUOUS");
  });
  add(0, "ENDTAB");
  add(0, "ENDSEC");
  add(0, "SECTION");
  add(2, "ENTITIES");
  for (const layer of result.layers) {
    for (const p of layer.paths) {
      add(0, "LWPOLYLINE");
      add(8, layer.name);
      add(90, p.points.length);
      add(70, 1);
      for (const pt of p.points) {
        add(10, pt.x.toFixed(4));
        add(20, (result.height - pt.y).toFixed(4));
      }
    }
  }
  add(0, "ENDSEC");
  add(0, "EOF");
  return `${lines.join("\n")}\n`;
}

function convertImage(image, options) {
  const quantized = quantizeImage(image.pixels, image.width, image.height, options.paletteSize);
  const layerCandidates = [];
  const totalPixels = image.width * image.height;
  for (let i = 0; i < quantized.palette.length; i += 1) {
    const coverage = quantized.counts[i] / totalPixels;
    const rawColor = quantized.palette[i];
    const color = calibrateOutputColor(rawColor);
    const lum = hexLuminance(color);
    const coverageThreshold = lum > 170 || lum < 40 ? 0.0001 : 0.002;
    if (coverage < coverageThreshold) {
      continue;
    }
    const isDarkLayer = hexLuminance(color) < 55;
    const isLightLayer = hexLuminance(color) > 240;
    const speckleThreshold = isDarkLayer || isLightLayer ? 1 : options.speckleThreshold;
    const tolerance = isDarkLayer
      ? Math.max(0.28, options.simplifyTolerance * 0.4)
      : isLightLayer
        ? Math.max(0.35, options.simplifyTolerance * 0.45)
        : options.simplifyTolerance;
    const smoothing = isDarkLayer ? options.smoothing * 0.1 : isLightLayer ? options.smoothing * 0.15 : options.smoothing;
    const minPolyArea = isDarkLayer || isLightLayer ? 1 : 8;

    const mask = removeSmallComponents(
      labelsToMask(quantized.labels, i),
      image.width,
      speckleThreshold
    );
    if (isBackgroundFlood(mask, image.width, image.height) && hexLuminance(color) < 220) {
      continue;
    }
    const polygons = maskToPolygons(mask, image.width, image.height);
    const paths = polygons
      .map((poly) => simplifyPath(poly, tolerance, smoothing, options.cornerThreshold))
      .filter((pts) => pts.length >= 3 && polygonArea(pts) >= minPolyArea)
      .map((pts) => ({ points: pts, area: polygonArea(pts) }))
      .sort((a, b) => b.area - a.area)
      .map((pts) => ({
        points: pts.points.map((p) => ({ x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) })),
        closed: true,
        area: pts.area
      }));
    if (paths.length) {
      layerCandidates.push({
        name: `COLOR_${String(i + 1).padStart(2, "0")}`,
        color,
        coverage,
        paths
      });
    }
  }

  const selected = layerCandidates
    .filter((l) => l.coverage >= options.minLayerCoveragePct)
    .sort((a, b) => b.coverage - a.coverage);
  if (selected.length < options.minLayerCount) {
    const used = new Set(selected.map((l) => l.name));
    const extras = layerCandidates
      .filter((l) => !used.has(l.name))
      .sort((a, b) => b.coverage - a.coverage)
      .slice(0, options.minLayerCount - selected.length);
    selected.push(...extras);
  }
  let layers = selected
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, options.maxLayerCount)
    .map((l) => ({ ...l, paths: [...l.paths] }));
  layers = layers.map((layer) => ({
    ...layer,
    color: calibrateOutputColor(layer.color)
  }));
  layers = mergeLikeColoredLayers(layers);

  for (const layer of layers) {
    const isDarkLayer = hexLuminance(layer.color) < 55;
    const layerCap = isDarkLayer ? Math.max(options.maxPathsPerLayer, 8) : options.maxPathsPerLayer;
    if (layer.paths.length <= layerCap) {
      continue;
    }
    const scored = layer.paths.map((p) => ({ ...p })).sort((a, b) => b.area - a.area);
    if (!isDarkLayer) {
      layer.paths = scored.slice(0, layerCap);
      continue;
    }
    const detailReserve = 2;
    const primary = scored.slice(0, Math.max(1, layerCap - detailReserve));
    const detail = scored
      .slice(Math.max(1, layerCap - detailReserve))
      .filter((p) => p.area >= 8 && p.area <= 320)
      .sort((a, b) => a.area - b.area)
      .slice(0, detailReserve);
    const selectedPaths = [...primary, ...detail];
    if (selectedPaths.length < layerCap) {
      const taken = new Set(selectedPaths);
      for (const p of scored) {
        if (taken.has(p)) {
          continue;
        }
        selectedPaths.push(p);
        if (selectedPaths.length >= layerCap) {
          break;
        }
      }
    }
    layer.paths = selectedPaths;
  }

  layers = layers.map((layer) => ({
    ...layer,
    color: calibrateOutputColor(layer.color)
  }));
  layers = mergeLikeColoredLayers(layers);

  const cleanLayers = layers.map((l) => ({
    name: l.name,
    color: l.color,
    paths: l.paths.map((p) => ({ points: p.points, closed: true }))
  }));

  let nodeCount = 0;
  let pathCount = 0;
  for (const layer of cleanLayers) {
    pathCount += layer.paths.length;
    for (const p of layer.paths) {
      nodeCount += p.points.length;
    }
  }
  const result = { width: image.width, height: image.height, layers: cleanLayers };
  return {
    ...result,
    metrics: { nodeCount, pathCount },
    svg: toSVG(result),
    eps: toEPS(result),
    dxf: toDXF(result)
  };
}

function run() {
  const args = parseArgs(process.argv);
  const inputDir = path.resolve(args.input);
  const outputDir = path.resolve(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const files = fs
    .readdirSync(inputDir)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b));
  if (!files.length) {
    throw new Error(`No PNG files found in ${inputDir}`);
  }

  for (const file of files) {
    const full = path.join(inputDir, file);
    const decoded = decodePng(full);
    const resized = resizeBilinear(decoded, 1000);
    const result = convertImage(resized, args);
    const base = path.basename(file, path.extname(file));
    fs.writeFileSync(path.join(outputDir, `${base}.svg`), result.svg, "utf8");
    fs.writeFileSync(path.join(outputDir, `${base}.eps`), result.eps, "utf8");
    fs.writeFileSync(path.join(outputDir, `${base}.dxf`), result.dxf, "utf8");
    console.log(
      `${file}: ${decoded.width}x${decoded.height} -> ${resized.width}x${resized.height} | layers=${result.layers.length} paths=${result.metrics.pathCount} nodes=${result.metrics.nodeCount}`
    );
  }

  console.log(`Done. Wrote outputs to ${outputDir}`);
}

run();
