import type { VectorPoint } from "@/types/vector";

function perpendicularDistance(point: VectorPoint, start: VectorPoint, end: VectorPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    const px = point.x - start.x;
    const py = point.y - start.y;
    return Math.sqrt(px * px + py * py);
  }
  const numerator = Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x);
  const denominator = Math.sqrt(dx * dx + dy * dy);
  return numerator / denominator;
}

function douglasPeucker(points: VectorPoint[], epsilon: number): VectorPoint[] {
  if (points.length < 3) {
    return points;
  }

  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const dist = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (dist > maxDistance) {
      index = i;
      maxDistance = dist;
    }
  }

  if (maxDistance > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

function angleAt(prev: VectorPoint, curr: VectorPoint, next: VectorPoint): number {
  const ax = prev.x - curr.x;
  const ay = prev.y - curr.y;
  const bx = next.x - curr.x;
  const by = next.y - curr.y;
  const dot = ax * bx + ay * by;
  const magA = Math.sqrt(ax * ax + ay * ay);
  const magB = Math.sqrt(bx * bx + by * by);
  if (!magA || !magB) {
    return 180;
  }
  const cos = Math.max(-1, Math.min(1, dot / (magA * magB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function smoothPoints(points: VectorPoint[], strength: number, cornerThresholdDeg: number): VectorPoint[] {
  if (points.length < 4 || strength <= 0) {
    return points;
  }
  const out: VectorPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const angle = angleAt(prev, curr, next);
    if (angle < cornerThresholdDeg) {
      out.push(curr);
    } else {
      out.push({
        x: curr.x * (1 - strength) + ((prev.x + next.x) * 0.5) * strength,
        y: curr.y * (1 - strength) + ((prev.y + next.y) * 0.5) * strength
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function chaikin(points: VectorPoint[], iterations: number, cornerThresholdDeg: number): VectorPoint[] {
  let current = points;
  for (let iter = 0; iter < iterations; iter += 1) {
    if (current.length < 4) {
      break;
    }
    const next: VectorPoint[] = [];
    const n = current.length;
    for (let i = 0; i < n; i += 1) {
      const p0 = current[i];
      const p1 = current[(i + 1) % n];
      const prev = current[(i - 1 + n) % n];
      const after = current[(i + 2) % n];
      const cornerA = angleAt(prev, p0, p1);
      const cornerB = angleAt(p0, p1, after);

      if (cornerA < cornerThresholdDeg || cornerB < cornerThresholdDeg) {
        next.push(p0);
        continue;
      }

      next.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25
      });
      next.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75
      });
    }
    current = next;
  }
  return current;
}

function relaxClosedPath(
  points: VectorPoint[],
  strength: number,
  cornerThresholdDeg: number,
): VectorPoint[] {
  if (points.length < 6 || strength <= 0) {
    return points;
  }

  const passes = strength >= 0.26 ? 2 : 1;
  const blend = Math.min(0.35, 0.12 + strength * 0.8);
  let current = points;

  for (let pass = 0; pass < passes; pass += 1) {
    const next: VectorPoint[] = [];
    const n = current.length;

    for (let i = 0; i < n; i += 1) {
      const prev = current[(i - 1 + n) % n];
      const curr = current[i];
      const after = current[(i + 1) % n];
      const angle = angleAt(prev, curr, after);

      if (angle < Math.max(14, cornerThresholdDeg * 0.75)) {
        next.push(curr);
        continue;
      }

      next.push({
        x: curr.x * (1 - blend) + ((prev.x + after.x) * 0.5) * blend,
        y: curr.y * (1 - blend) + ((prev.y + after.y) * 0.5) * blend,
      });
    }

    current = next;
  }

  return current;
}

export function simplifyPath(
  points: VectorPoint[],
  tolerance: number,
  smoothing: number,
  cornerThresholdDeg: number
): VectorPoint[] {
  if (points.length < 4) {
    return points;
  }
  const closed = [...points, points[0]];
  const simplified = douglasPeucker(closed, Math.max(0.4, tolerance)).slice(0, -1);
  const clampedSmoothing = Math.min(0.45, Math.max(0, smoothing));
  const clampedCornerThreshold = Math.max(5, Math.min(170, cornerThresholdDeg));
  const smoothed = smoothPoints(
    simplified,
    clampedSmoothing,
    clampedCornerThreshold
  );

  // Stronger smoothing for traced raster edges: one or two guarded Chaikin
  // passes round off staircase contours while preserving hard corners.
  if (smoothed.length < 6 || clampedSmoothing < 0.08) {
    return smoothed;
  }

  const iterations = clampedSmoothing >= 0.22 ? 2 : 1;
  const subdivided = chaikin(
    smoothed,
    iterations,
    Math.max(18, Math.min(140, clampedCornerThreshold * 0.85))
  );
  return relaxClosedPath(
    subdivided,
    clampedSmoothing,
    Math.max(16, clampedCornerThreshold * 0.8)
  );
}
