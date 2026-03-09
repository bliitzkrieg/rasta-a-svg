/**
 * Pure helpers used by the vectorize worker. Kept in lib for testability and
 * to keep the worker file focused on orchestration and messaging.
 */

import { closeMask } from "@/lib/vectorize/trace";
import type { VectorLayer } from "@/types/vector";

export type Point = { x: number; y: number };

export function simplifyToleranceForPreset(
  baseTolerance: number,
  preset: "strict-fidelity" | "fidelity" | "balanced" | "minimal-nodes",
): number {
  if (preset === "strict-fidelity") return Math.max(0.18, baseTolerance * 0.4);
  if (preset === "fidelity") return Math.max(0.25, baseTolerance * 0.55);
  if (preset === "minimal-nodes") return Math.max(1.2, baseTolerance * 1.7);
  return Math.max(0.45, baseTolerance * 0.85);
}

export function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
}

export function signedArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isClockwise(points: Point[]): boolean {
  return signedArea(points) < 0;
}

export function ensureWinding(points: Point[], clockwise: boolean): Point[] {
  const currentClockwise = isClockwise(points);
  return currentClockwise === clockwise ? points : [...points].reverse();
}

export function clampAndRoundPoint(
  p: Point,
  width: number,
  height: number,
): Point {
  return {
    x: Number(Math.max(0, Math.min(width, p.x)).toFixed(2)),
    y: Number(Math.max(0, Math.min(height, p.y)).toFixed(2)),
  };
}

export function normalizePoints(
  points: Point[],
  width: number,
  height: number,
): Point[] {
  return points.map((p) => clampAndRoundPoint(p, width, height));
}

export function collapseShortEdges(points: Point[], minLen = 0.75): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || dist(prev, p) >= minLen) out.push(p);
  }
  if (out.length >= 2 && dist(out[0], out[out.length - 1]) < minLen) out.pop();
  return out.length >= 3 ? out : points;
}

export function removeNearDuplicatePoints(
  points: Point[],
  epsilon = 0.01,
): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || dist(prev, p) > epsilon) out.push(p);
  }
  if (out.length >= 2 && dist(out[0], out[out.length - 1]) <= epsilon) out.pop();
  return out.length >= 3 ? out : points;
}

export function removeNearCollinear(
  points: Point[],
  epsilon = 0.02,
): Point[] {
  if (points.length < 4) return points;
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
    if (denom === 0 || cross / denom > epsilon) out.push(curr);
  }
  return out.length >= 3 ? out : points;
}

export function turningAngle(prev: Point, curr: Point, next: Point): number {
  const ax = curr.x - prev.x;
  const ay = curr.y - prev.y;
  const bx = next.x - curr.x;
  const by = next.y - curr.y;
  const amag = Math.hypot(ax, ay);
  const bmag = Math.hypot(bx, by);
  if (amag === 0 || bmag === 0) return 0;
  const dot = (ax * bx + ay * by) / (amag * bmag);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

export function countSharpTurns(
  points: Point[],
  thresholdRad = 0.6,
): number {
  if (points.length < 3) return 0;
  let count = 0;
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    if (turningAngle(prev, curr, next) > thresholdRad) count += 1;
  }
  return count;
}

export function hasShortEdge(points: Point[], minLen = 0.5): boolean {
  for (let i = 0; i < points.length; i += 1) {
    if (dist(points[i], points[(i + 1) % points.length]) < minLen) return true;
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
  if (o1 === 0 && pointOnSegment(a1, b1, a2)) return true;
  if (o2 === 0 && pointOnSegment(a1, b2, a2)) return true;
  if (o3 === 0 && pointOnSegment(b1, a1, b2)) return true;
  if (o4 === 0 && pointOnSegment(b1, a2, b2)) return true;
  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0;
}

export function selfIntersects(points: Point[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i += 1) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

export function postProcessContour(
  points: Point[],
  preserveClockwise: boolean,
): Point[] {
  let out = removeNearDuplicatePoints(points, 0.01);
  out = collapseShortEdges(out, 0.75);
  out = removeNearCollinear(out, 0.02);
  out = ensureWinding(out, preserveClockwise);
  return out.length >= 3 ? out : points;
}

function isParallelForward(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  return Math.abs(ax * by - ay * bx) < 1e-6 && ax * bx + ay * by > 0;
}

export function softenOrthogonalStairs(
  points: Point[],
  maxStep = 1.35,
): Point[] {
  if (points.length < 6) return points;
  const out: Point[] = [];
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const prev2 = points[(i - 2 + n) % n];
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const next2 = points[(i + 2 + n) % n];
    const abx = prev.x - prev2.x;
    const aby = prev.y - prev2.y;
    const bcx = curr.x - prev.x;
    const bcy = curr.y - prev.y;
    const cdx = next.x - curr.x;
    const cdy = next.y - curr.y;
    const dex = next2.x - next.x;
    const dey = next2.y - next.y;
    const prevLen = Math.hypot(bcx, bcy);
    const nextLen = Math.hypot(cdx, cdy);
    const shortOrthogonalStep =
      prevLen <= maxStep &&
      nextLen <= maxStep &&
      Math.abs(bcx * cdx + bcy * cdy) < 1e-6 &&
      (Math.abs(bcx) < 1e-6 || Math.abs(bcy) < 1e-6) &&
      (Math.abs(cdx) < 1e-6 || Math.abs(cdy) < 1e-6);
    const continuesStaircase =
      isParallelForward(abx, aby, cdx, cdy) &&
      isParallelForward(bcx, bcy, dex, dey);
    if (shortOrthogonalStep && continuesStaircase) continue;
    out.push(curr);
  }
  return out.length >= 3 ? out : points;
}

export function hasJoinDamage(raw: Point[], simp: Point[]): boolean {
  if (simp.length < 3) return true;
  const rawAbsArea = Math.abs(signedArea(raw));
  const simpAbsArea = Math.abs(signedArea(simp));
  const areaDelta =
    rawAbsArea > 0 ? Math.abs(simpAbsArea - rawAbsArea) / rawAbsArea : 0;
  const rawSharp = countSharpTurns(raw, 0.6);
  const simpSharp = countSharpTurns(simp, 0.6);
  if (selfIntersects(simp)) return true;
  if (areaDelta > 0.08) return true;
  if (simpSharp > rawSharp + 2) return true;
  if (hasShortEdge(simp, 0.5)) return true;
  return false;
}

export function dilateMask(
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
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
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

export function erodeMask(
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

export function closeThenFeatherDarkMask(
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  let out = closeMask(mask, width, height, 1);
  out = dilateMask(out, width, height, 1);
  out = erodeMask(out, width, height, 1);
  return out;
}

export function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export function polygonBounds(points: Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

export function isTinyDarkFragment(points: Point[], area: number): boolean {
  if (area > 9) return false;
  const bounds = polygonBounds(points);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return width <= 4 && height <= 4;
}

export function expandPolygonRadially(
  points: Point[],
  amount: number,
  width: number,
  height: number,
): Point[] {
  if (points.length < 3 || amount <= 0) return points;
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
        { x: p.x + (dx / len) * amount, y: p.y + (dy / len) * amount },
        width,
        height,
      ),
    );
  }
  return out;
}

export function capLayerPathsByArea<T extends { area: number }>(
  paths: T[],
  isDarkLayer: boolean,
  maxPaths: number,
): T[] {
  if (paths.length <= maxPaths) {
    return [...paths];
  }

  const scored = [...paths].sort((a, b) => b.area - a.area);
  if (!isDarkLayer) {
    return scored.slice(0, maxPaths);
  }

  const detailReserve = Math.min(2, Math.max(0, maxPaths - 1));
  const primary = scored.slice(0, Math.max(1, maxPaths - detailReserve));
  const detail = scored
    .slice(Math.max(1, maxPaths - detailReserve))
    .filter((path) => path.area >= 8 && path.area <= 320)
    .sort((a, b) => a.area - b.area)
    .slice(0, detailReserve);

  const selected = [...primary];
  for (const path of detail) {
    if (!selected.includes(path)) {
      selected.push(path);
    }
  }

  if (selected.length >= maxPaths) {
    return selected.slice(0, maxPaths);
  }

  for (const path of scored) {
    if (selected.includes(path)) {
      continue;
    }
    selected.push(path);
    if (selected.length >= maxPaths) {
      break;
    }
  }

  return selected;
}

export function layerArea(layer: VectorLayer): number {
  let total = 0;
  for (const path of layer.paths) {
    total += polygonArea(path.points);
  }
  return total;
}

export function layerPrimaryPathArea(layer: VectorLayer): number {
  let largest = 0;
  for (const path of layer.paths) {
    largest = Math.max(largest, polygonArea(path.points));
  }
  return largest;
}

export function hexLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) || 0;
  const g = Number.parseInt(value.slice(2, 4), 16) || 0;
  const b = Number.parseInt(value.slice(4, 6), 16) || 0;
  return r * 0.299 + g * 0.587 + b * 0.114;
}

export function normalizeLayerColor(hex: string): string {
  return hexLuminance(hex) < 30 ? "#000000" : hex;
}

export function isBackgroundFlood(
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
      if (!mask[idx]) continue;
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
