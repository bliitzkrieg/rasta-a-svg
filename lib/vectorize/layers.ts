import type { VectorPoint } from "@/types/vector";

interface Segment {
  start: VectorPoint;
  end: VectorPoint;
}

function key(point: VectorPoint): string {
  return `${point.x},${point.y}`;
}

function edgeKey(a: VectorPoint, b: VectorPoint): string {
  const ka = key(a);
  const kb = key(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function maskAt(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return 0;
  }
  return mask[y * width + x] ? 1 : 0;
}

function makePoint(x: number, y: number): VectorPoint {
  return {
    x: Number((x - 0.5).toFixed(2)),
    y: Number((y - 0.5).toFixed(2)),
  };
}

function cellSegments(x: number, y: number, state: number): Segment[] {
  const top = makePoint(x + 0.5, y);
  const right = makePoint(x + 1, y + 0.5);
  const bottom = makePoint(x + 0.5, y + 1);
  const left = makePoint(x, y + 0.5);

  switch (state) {
    case 1:
      return [{ start: left, end: bottom }];
    case 2:
      return [{ start: bottom, end: right }];
    case 3:
      return [{ start: left, end: right }];
    case 4:
      return [{ start: top, end: right }];
    case 5:
      return [
        { start: top, end: right },
        { start: left, end: bottom },
      ];
    case 6:
      return [{ start: top, end: bottom }];
    case 7:
      return [{ start: top, end: left }];
    case 8:
      return [{ start: top, end: left }];
    case 9:
      return [{ start: top, end: bottom }];
    case 10:
      return [
        { start: top, end: left },
        { start: bottom, end: right },
      ];
    case 11:
      return [{ start: top, end: right }];
    case 12:
      return [{ start: left, end: right }];
    case 13:
      return [{ start: bottom, end: right }];
    case 14:
      return [{ start: left, end: bottom }];
    default:
      return [];
  }
}

function pushNeighbor(
  map: Map<string, VectorPoint[]>,
  from: VectorPoint,
  to: VectorPoint,
): void {
  const neighbors = map.get(key(from)) ?? [];
  neighbors.push(to);
  map.set(key(from), neighbors);
}

function traceLoops(segments: Segment[]): VectorPoint[][] {
  const adjacency = new Map<string, VectorPoint[]>();
  const points = new Map<string, VectorPoint>();

  for (const segment of segments) {
    points.set(key(segment.start), segment.start);
    points.set(key(segment.end), segment.end);
    pushNeighbor(adjacency, segment.start, segment.end);
    pushNeighbor(adjacency, segment.end, segment.start);
  }

  const used = new Set<string>();
  const polygons: VectorPoint[][] = [];

  for (const segment of segments) {
    const startEdgeKey = edgeKey(segment.start, segment.end);
    if (used.has(startEdgeKey)) {
      continue;
    }

    const loop: VectorPoint[] = [segment.start];
    let prev = segment.start;
    let current = segment.end;
    used.add(startEdgeKey);
    let guard = 0;

    while (guard < 1_000_000) {
      guard += 1;
      if (current.x === loop[0].x && current.y === loop[0].y) {
        break;
      }

      loop.push(current);

      const neighbors = adjacency.get(key(current)) ?? [];
      const next = neighbors.find((candidate) => {
        if (candidate.x === prev.x && candidate.y === prev.y) {
          return false;
        }
        return !used.has(edgeKey(current, candidate));
      });

      if (!next) {
        break;
      }

      used.add(edgeKey(current, next));
      prev = current;
      current = points.get(key(next)) ?? next;
    }

    if (loop.length >= 3) {
      polygons.push(loop);
    }
  }

  return polygons;
}

export function maskToPolygons(
  mask: Uint8Array,
  width: number,
  height: number,
): VectorPoint[][] {
  const segments: Segment[] = [];

  for (let y = 0; y <= height; y += 1) {
    for (let x = 0; x <= width; x += 1) {
      const tl = maskAt(mask, width, height, x - 1, y - 1);
      const tr = maskAt(mask, width, height, x, y - 1);
      const br = maskAt(mask, width, height, x, y);
      const bl = maskAt(mask, width, height, x - 1, y);
      const state = (tl << 3) | (tr << 2) | (br << 1) | bl;
      segments.push(...cellSegments(x, y, state));
    }
  }

  return traceLoops(segments);
}
