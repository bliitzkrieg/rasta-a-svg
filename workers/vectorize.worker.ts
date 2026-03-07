/// <reference lib="webworker" />

import { toDXF } from "@/lib/export/dxf";
import { toEPSLevel2 } from "@/lib/export/eps";
import { toSVG } from "@/lib/export/svg";
import { maskToPolygons } from "@/lib/vectorize/layers";
import { computeMetrics } from "@/lib/vectorize/metrics";
import { quantizeImage } from "@/lib/vectorize/quantize";
import { simplifyPath } from "@/lib/vectorize/simplify";
import {
  closeMask,
  labelsToMask,
  removeSmallComponents,
} from "@/lib/vectorize/trace";
import type {
  ConvertJobError,
  ConvertJobProgress,
  ConvertJobRequest,
  ConvertJobResult,
  VectorLayer,
} from "@/types/vector";

type WorkerInMessage = { type: "convert"; payload: ConvertJobRequest };
type WorkerOutMessage =
  | { type: "progress"; payload: ConvertJobProgress }
  | { type: "result"; payload: ConvertJobResult }
  | { type: "error"; payload: ConvertJobError };

type Point = { x: number; y: number };

function postMessageTyped(message: WorkerOutMessage): void {
  self.postMessage(message);
}

function simplifyToleranceForPreset(
  baseTolerance: number,
  preset: "fidelity" | "balanced" | "minimal-nodes",
): number {
  if (preset === "fidelity") {
    return Math.max(0.25, baseTolerance * 0.55);
  }
  if (preset === "minimal-nodes") {
    return Math.max(1.2, baseTolerance * 1.7);
  }
  return Math.max(0.45, baseTolerance * 0.85);
}

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
}

function signedArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isClockwise(points: Point[]): boolean {
  return signedArea(points) < 0;
}

function ensureWinding(points: Point[], clockwise: boolean): Point[] {
  const currentClockwise = isClockwise(points);
  return currentClockwise === clockwise ? points : [...points].reverse();
}

function clampAndRoundPoint(p: Point, width: number, height: number): Point {
  return {
    x: Number(Math.max(0, Math.min(width, p.x)).toFixed(2)),
    y: Number(Math.max(0, Math.min(height, p.y)).toFixed(2)),
  };
}

function normalizePoints(
  points: Point[],
  width: number,
  height: number,
): Point[] {
  return points.map((p) => clampAndRoundPoint(p, width, height));
}

function collapseShortEdges(points: Point[], minLen = 0.75): Point[] {
  if (points.length < 3) {
    return points;
  }

  const out: Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || dist(prev, p) >= minLen) {
      out.push(p);
    }
  }

  if (out.length >= 2 && dist(out[0], out[out.length - 1]) < minLen) {
    out.pop();
  }

  return out.length >= 3 ? out : points;
}

function removeNearDuplicatePoints(points: Point[], epsilon = 0.01): Point[] {
  if (points.length < 3) {
    return points;
  }

  const out: Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || dist(prev, p) > epsilon) {
      out.push(p);
    }
  }

  if (out.length >= 2 && dist(out[0], out[out.length - 1]) <= epsilon) {
    out.pop();
  }

  return out.length >= 3 ? out : points;
}

function removeNearCollinear(points: Point[], epsilon = 0.02): Point[] {
  if (points.length < 4) {
    return points;
  }

  const out: Point[] = [];

  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];

    const ax = curr.x - prev.x;
    const ay = curr.y - prev.y;
    const bx = next.x - curr.x;
    const by = next.y - curr.y;

    const cross = Math.abs(ax * by - ay * bx);
    const denom = Math.hypot(ax, ay) * Math.hypot(bx, by);

    if (denom === 0 || cross / denom > epsilon) {
      out.push(curr);
    }
  }

  return out.length >= 3 ? out : points;
}

function turningAngle(prev: Point, curr: Point, next: Point): number {
  const ax = curr.x - prev.x;
  const ay = curr.y - prev.y;
  const bx = next.x - curr.x;
  const by = next.y - curr.y;

  const amag = Math.hypot(ax, ay);
  const bmag = Math.hypot(bx, by);
  if (amag === 0 || bmag === 0) {
    return 0;
  }

  const dot = (ax * bx + ay * by) / (amag * bmag);
  const clamped = Math.max(-1, Math.min(1, dot));
  return Math.acos(clamped);
}

function countSharpTurns(points: Point[], thresholdRad = 0.6): number {
  if (points.length < 3) {
    return 0;
  }

  let count = 0;
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    if (turningAngle(prev, curr, next) > thresholdRad) {
      count += 1;
    }
  }
  return count;
}

function hasShortEdge(points: Point[], minLen = 0.5): boolean {
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (dist(a, b) < minLen) {
      return true;
    }
  }
  return false;
}

function segmentOrientation(a: Point, b: Point, c: Point): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function pointOnSegment(a: Point, b: Point, c: Point): boolean {
  return (
    Math.min(a.x, c.x) <= b.x &&
    b.x <= Math.max(a.x, c.x) &&
    Math.min(a.y, c.y) <= b.y &&
    b.y <= Math.max(a.y, c.y)
  );
}

function segmentsIntersect(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): boolean {
  const o1 = segmentOrientation(a1, a2, b1);
  const o2 = segmentOrientation(a1, a2, b2);
  const o3 = segmentOrientation(b1, b2, a1);
  const o4 = segmentOrientation(b1, b2, a2);

  if (o1 === 0 && pointOnSegment(a1, b1, a2)) {
    return true;
  }
  if (o2 === 0 && pointOnSegment(a1, b2, a2)) {
    return true;
  }
  if (o3 === 0 && pointOnSegment(b1, a1, b2)) {
    return true;
  }
  if (o4 === 0 && pointOnSegment(b1, a2, b2)) {
    return true;
  }

  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0;
}

function selfIntersects(points: Point[]): boolean {
  const n = points.length;
  if (n < 4) {
    return false;
  }

  for (let i = 0; i < n; i += 1) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];

    for (let j = i + 1; j < n; j += 1) {
      if (Math.abs(i - j) <= 1) {
        continue;
      }
      if (i === 0 && j === n - 1) {
        continue;
      }

      const b1 = points[j];
      const b2 = points[(j + 1) % n];

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  return false;
}

function postProcessContour(
  points: Point[],
  preserveClockwise: boolean,
): Point[] {
  let out = removeNearDuplicatePoints(points, 0.01);
  out = collapseShortEdges(out, 0.75);
  out = removeNearCollinear(out, 0.02);
  out = ensureWinding(out, preserveClockwise);
  return out.length >= 3 ? out : points;
}

function hasJoinDamage(raw: Point[], simp: Point[]): boolean {
  if (simp.length < 3) {
    return true;
  }

  const rawAbsArea = Math.abs(signedArea(raw));
  const simpAbsArea = Math.abs(signedArea(simp));
  const areaDelta =
    rawAbsArea > 0 ? Math.abs(simpAbsArea - rawAbsArea) / rawAbsArea : 0;

  const rawSharp = countSharpTurns(raw, 0.6);
  const simpSharp = countSharpTurns(simp, 0.6);

  if (selfIntersects(simp)) {
    return true;
  }
  if (areaDelta > 0.08) {
    return true;
  }
  if (simpSharp > rawSharp + 2) {
    return true;
  }
  if (hasShortEdge(simp, 0.5)) {
    return true;
  }

  return false;
}

function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius = 1,
): Uint8Array {
  const out = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = 0;

      for (let dy = -radius; dy <= radius && !hit; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          if (mask[ny * width + nx]) {
            hit = 1;
            break;
          }
        }
      }

      out[y * width + x] = hit;
    }
  }

  return out;
}

function erodeMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius = 1,
): Uint8Array {
  const out = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = 1;

      for (let dy = -radius; dy <= radius && keep; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            keep = 0;
            break;
          }
          if (!mask[ny * width + nx]) {
            keep = 0;
            break;
          }
        }
      }

      out[y * width + x] = keep;
    }
  }

  return out;
}

function closeThenFeatherDarkMask(
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  let out = closeMask(mask, width, height, 1);
  out = dilateMask(out, width, height, 1);
  out = erodeMask(out, width, height, 1);
  return out;
}

function centroid(points: Point[]): Point {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }

  return {
    x: x / points.length,
    y: y / points.length,
  };
}

function expandPolygonRadially(
  points: Point[],
  amount: number,
  width: number,
  height: number,
): Point[] {
  if (points.length < 3 || amount <= 0) {
    return points;
  }

  const c = centroid(points);
  const out: Point[] = [];

  for (const p of points) {
    let dx = p.x - c.x;
    let dy = p.y - c.y;
    let len = Math.hypot(dx, dy);

    if (len < 1e-6) {
      dx = 1;
      dy = 0;
      len = 1;
    }

    out.push(
      clampAndRoundPoint(
        {
          x: p.x + (dx / len) * amount,
          y: p.y + (dy / len) * amount,
        },
        width,
        height,
      ),
    );
  }

  return out;
}

function layerArea(layer: VectorLayer): number {
  let total = 0;
  for (const path of layer.paths) {
    total += polygonArea(path.points);
  }
  return total;
}

function mergeLikeColoredLayers(layers: VectorLayer[]): VectorLayer[] {
  const merged = new Map<string, VectorLayer>();
  for (const layer of layers) {
    const existing = merged.get(layer.color);
    if (!existing) {
      merged.set(layer.color, { ...layer, paths: [...layer.paths] });
      continue;
    }
    existing.paths.push(...layer.paths);
  }
  return Array.from(merged.values());
}

function clampLayers(layers: VectorLayer[]): VectorLayer[] {
  if (layers.length === 0) {
    return layers;
  }

  const scored = layers
    .map((layer) => ({
      layer,
      score: layerArea(layer),
    }))
    .sort((a, b) => b.score - a.score);

  const cappedLayers = scored.slice(0, 12).map((entry) => entry.layer);
  const maxPathsPerLayer = 12;
  const maxDarkPathsPerLayer = 28;
  const detailReserveCount = 8;

  for (const layer of cappedLayers) {
    const isDarkLayer = hexLuminance(layer.color) < 55;
    const layerCap = isDarkLayer ? maxDarkPathsPerLayer : maxPathsPerLayer;
    if (layer.paths.length <= layerCap) {
      continue;
    }

    const scoredPaths = layer.paths
      .map((path) => ({ path, area: polygonArea(path.points) }))
      .sort((a, b) => b.area - a.area);

    if (!isDarkLayer) {
      const localDetailReserve = 3;
      const primaryCount = Math.max(1, layerCap - localDetailReserve);
      const primary = scoredPaths.slice(0, primaryCount);
      const detail = scoredPaths
        .slice(primaryCount)
        .filter((entry) => entry.area >= 0.5 && entry.area <= 650)
        .sort((a, b) => a.area - b.area)
        .slice(0, localDetailReserve);
      layer.paths = [...primary, ...detail].map((entry) => entry.path);
      continue;
    }

    const primaryCount = Math.max(1, layerCap - detailReserveCount);
    const primary = scoredPaths.slice(0, primaryCount);
    const detail = scoredPaths
      .slice(primaryCount)
      .filter((entry) => entry.area >= 1 && entry.area <= 420)
      .sort((a, b) => a.area - b.area)
      .slice(0, detailReserveCount);

    const selected = [...primary, ...detail];
    if (selected.length < layerCap) {
      const set = new Set(selected.map((entry) => entry.path));
      for (const entry of scoredPaths) {
        if (set.has(entry.path)) {
          continue;
        }
        selected.push(entry);
        if (selected.length >= layerCap) {
          break;
        }
      }
    }

    layer.paths = selected.map((entry) => entry.path);
  }

  return cappedLayers;
}

function hexLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) || 0;
  const g = Number.parseInt(value.slice(2, 4), 16) || 0;
  const b = Number.parseInt(value.slice(4, 6), 16) || 0;
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16) || 0,
    g: Number.parseInt(value.slice(2, 4), 16) || 0,
    b: Number.parseInt(value.slice(4, 6), 16) || 0,
  };
}

function calibrateOutputColor(hex: string): string {
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

  if (lum < 55) {
    return "#000000";
  }
  if (lum > 232 && sat < 0.18) {
    return "#fffdff";
  }
  if (lum > 210 && sat < 0.35 && Math.abs(r - g) < 35 && Math.abs(g - b) < 35) {
    return "#fffdff";
  }
  if (
    lum > 180 &&
    lum <= 232 &&
    sat >= 0.12 &&
    sat < 0.45 &&
    r >= g &&
    g >= b &&
    hue <= 35
  ) {
    return "#fad9cd";
  }
  if (sat > 0.45 && hue >= 20 && hue <= 55) {
    return "#fab53c";
  }
  if (sat > 0.35 && (hue <= 20 || hue >= 340)) {
    return "#f55255";
  }
  return hex;
}

function isBackgroundFlood(
  mask: Uint8Array,
  width: number,
  height: number,
): boolean {
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
      if (y === 0) {
        top = true;
      }
      if (y === height - 1) {
        bottom = true;
      }
      if (x === 0) {
        left = true;
      }
      if (x === width - 1) {
        right = true;
      }
    }
  }

  const coverage = count / (width * height);
  return coverage > 0.25 && top && bottom && left && right;
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const message = event.data;
  if (message.type !== "convert") {
    return;
  }

  const { payload } = message;
  const startedAt = performance.now();

  try {
    postMessageTyped({
      type: "progress",
      payload: { id: payload.id, phase: "Quantizing colors", progress: 10 },
    });

    const quantized = quantizeImage(
      payload.pixels,
      payload.width,
      payload.height,
      payload.settings.paletteSize,
      payload.settings.paletteMode === "auto",
    );

    const simplifyTolerance = simplifyToleranceForPreset(
      payload.settings.simplifyTolerancePx,
      payload.settings.optimizePreset,
    );

    const {
      speckleThresholdPx,
      smoothing,
      cornerThresholdDeg,
      calibrate,
      converterStrategy,
    } = payload.settings;

    const useAdaptiveSimplify =
      converterStrategy === "adaptive" || converterStrategy === "high-fidelity";
    const isHighFidelity = converterStrategy === "high-fidelity";
    const maxPathsPerLayer = isHighFidelity ? 10 : 6;
    const minLayerCoveragePct = isHighFidelity ? 0.0005 : 0.003;
    const minLayerCount = isHighFidelity ? 6 : 5;
    const maxLayerCount = isHighFidelity ? 12 : 8;
    const totalPixels = payload.width * payload.height;
    const total = quantized.palette.length;

    type LayerCandidate = VectorLayer & {
      coverage: number;
      pathAreas: number[];
    };

    const layerCandidates: LayerCandidate[] = [];

    for (let index = 0; index < total; index += 1) {
      postMessageTyped({
        type: "progress",
        payload: {
          id: payload.id,
          phase: `Tracing layer ${index + 1}/${total}`,
          progress: 20 + Math.round(((index + 1) / total) * 60),
        },
      });

      const rawColor = quantized.palette[index];
      const color = calibrate ? calibrateOutputColor(rawColor) : rawColor;
      const coverage = quantized.counts[index] / totalPixels;
      const lum = hexLuminance(color);
      const coverageThreshold = lum > 170 || lum < 40 ? 0.0001 : 0.002;

      if (coverage < coverageThreshold) {
        continue;
      }

      const isDarkLayer = lum < 55;
      const isLightLayer = lum > 240;
      const layerSpeckle = isDarkLayer || isLightLayer ? 1 : speckleThresholdPx;

      const layerTolerance = isDarkLayer
        ? Math.max(0.28, simplifyTolerance * 0.4)
        : isLightLayer
          ? Math.max(0.35, simplifyTolerance * 0.45)
          : simplifyTolerance;

      const baseLayerSmoothing = isDarkLayer
        ? smoothing * 0.1
        : isLightLayer
          ? smoothing * 0.15
          : smoothing;

      const layerSmoothing =
        converterStrategy === "high-fidelity"
          ? Math.min(0.28, baseLayerSmoothing * 1.25)
          : baseLayerSmoothing;

      const minPolyArea = isDarkLayer || isLightLayer ? 1 : 8;

      const rawMask = labelsToMask(
        quantized.labels,
        payload.width,
        payload.height,
        index,
      );

      if (
        isBackgroundFlood(rawMask, payload.width, payload.height) &&
        lum < 220
      ) {
        continue;
      }

      let mask = removeSmallComponents(
        rawMask,
        payload.width,
        payload.height,
        layerSpeckle,
      );

      if (isDarkLayer) {
        mask = closeThenFeatherDarkMask(mask, payload.width, payload.height);
      }

      const polygons = maskToPolygons(mask, payload.width, payload.height);

      const pathsWithArea = polygons
        .map((poly) => {
          const rawRounded = normalizePoints(
            poly,
            payload.width,
            payload.height,
          );
          const rawArea = polygonArea(rawRounded);
          const rawClockwise = isClockwise(rawRounded);
          const isOutlineLike = isDarkLayer && rawArea < 5000;

          let adaptiveTol = layerTolerance;
          if (useAdaptiveSimplify) {
            if (rawArea < 80) {
              adaptiveTol = Math.min(layerTolerance, 0.1);
            } else if (rawArea < 250) {
              adaptiveTol = Math.min(layerTolerance, 0.18);
            } else if (rawArea < 800) {
              adaptiveTol = Math.min(layerTolerance, 0.3);
            } else if (rawArea < 2500) {
              adaptiveTol = Math.min(layerTolerance, 0.55);
            }
          }

          if (isOutlineLike) {
            adaptiveTol = Math.min(adaptiveTol, 0.18);
          }

          let smoothForPoly = layerSmoothing;
          if (isDarkLayer) {
            if (rawArea < 4000) {
              smoothForPoly = Math.min(smoothForPoly, 0.02);
            }
            if (rawArea < 1500) {
              smoothForPoly = 0;
            }
          }
          if (isHighFidelity && rawArea < 250) {
            smoothForPoly = 0;
          }
          if (isOutlineLike) {
            smoothForPoly = 0;
          }

          let pts = simplifyPath(
            poly,
            adaptiveTol,
            smoothForPoly,
            cornerThresholdDeg,
          );

          pts = normalizePoints(pts, payload.width, payload.height);
          pts = postProcessContour(pts, rawClockwise);

          const fallback = postProcessContour(rawRounded, rawClockwise);
          if (isHighFidelity && hasJoinDamage(rawRounded, pts)) {
            pts = fallback;
          }

          // Important new step:
          // Slightly expand dark outline-like polygons so adjacent fills/outline joins
          // overlap instead of leaving tiny visible seams.
          if (isOutlineLike) {
            const haloAmount =
              rawArea < 500 ? 0.55 : rawArea < 1500 ? 0.42 : 0.3;

            pts = expandPolygonRadially(
              pts,
              haloAmount,
              payload.width,
              payload.height,
            );
            pts = postProcessContour(pts, rawClockwise);
          }

          const area = polygonArea(pts);
          return { pts, area };
        })
        .filter(({ pts, area }) => pts.length >= 3 && area >= minPolyArea)
        .sort((a, b) => b.area - a.area);

      if (pathsWithArea.length === 0) {
        continue;
      }

      layerCandidates.push({
        name: `COLOR_${String(index + 1).padStart(2, "0")}`,
        color,
        coverage,
        paths: pathsWithArea.map(({ pts }) => ({
          points: pts,
          closed: true,
          nodeCount: pts.length,
        })),
        pathAreas: pathsWithArea.map(({ area }) => area),
      });
    }

    const selected = layerCandidates
      .filter((l) => l.coverage >= minLayerCoveragePct)
      .sort((a, b) => b.coverage - a.coverage);

    if (selected.length < minLayerCount) {
      const used = new Set(selected.map((l) => l.name));
      const extras = layerCandidates
        .filter((l) => !used.has(l.name))
        .sort((a, b) => b.coverage - a.coverage)
        .slice(0, minLayerCount - selected.length);
      selected.push(...extras);
    }

    let layers = selected
      .sort((a, b) => b.coverage - a.coverage)
      .slice(0, maxLayerCount)
      .map((l) => ({ ...l, paths: [...l.paths] }));

    if (calibrate) {
      layers = layers.map((l) => ({
        ...l,
        color: calibrateOutputColor(l.color),
      }));
      layers = mergeLikeColoredLayers(layers) as LayerCandidate[];
    }

    if (!isHighFidelity) {
      for (const layer of layers) {
        const isDarkLayer = hexLuminance(layer.color) < 55;
        const cap = isDarkLayer
          ? Math.max(maxPathsPerLayer, 8)
          : maxPathsPerLayer;

        if (layer.paths.length <= cap) {
          continue;
        }

        const areas =
          (layer as LayerCandidate).pathAreas ??
          layer.paths.map((p) => polygonArea(p.points));

        const scored = layer.paths
          .map((p, i) => ({ p, area: areas[i] ?? 0 }))
          .sort((a, b) => b.area - a.area);

        if (!isDarkLayer) {
          layer.paths = scored.slice(0, cap).map(({ p }) => p);
          continue;
        }

        const detailReserve = 2;
        const primary = scored.slice(0, Math.max(1, cap - detailReserve));
        const detail = scored
          .slice(Math.max(1, cap - detailReserve))
          .filter(({ area }) => area >= 8 && area <= 320)
          .sort((a, b) => a.area - b.area)
          .slice(0, detailReserve);

        layer.paths = [...primary, ...detail].map(({ p }) => p);
      }
    }

    const preparedLayers = isHighFidelity
      ? (layers as VectorLayer[])
      : clampLayers(layers as VectorLayer[]);

    const outputLayers = preparedLayers.sort(
      (a, b) => layerArea(b) - layerArea(a),
    );

    postMessageTyped({
      type: "progress",
      payload: { id: payload.id, phase: "Exporting vectors", progress: 92 },
    });

    const baseResult = {
      width: payload.width,
      height: payload.height,
      layers: outputLayers,
      metrics: computeMetrics(outputLayers, startedAt),
    };

    const svg = toSVG(baseResult);
    const eps = toEPSLevel2(baseResult);
    const dxf = toDXF(baseResult);

    postMessageTyped({
      type: "result",
      payload: {
        id: payload.id,
        result: {
          ...baseResult,
          svg,
          eps,
          dxf,
        },
      },
    });
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : "Conversion failed";

    postMessageTyped({
      type: "error",
      payload: {
        id: payload.id,
        error: messageText,
      },
    });
  }
};

export {};
