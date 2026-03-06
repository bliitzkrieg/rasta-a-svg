import type { VectorPoint } from "@/types/vector";

interface Edge {
  id: number;
  start: VectorPoint;
  end: VectorPoint;
}

function key(point: VectorPoint): string {
  return `${point.x},${point.y}`;
}

function pushEdge(edges: Edge[], start: VectorPoint, end: VectorPoint): void {
  edges.push({ id: edges.length, start, end });
}

function direction(from: VectorPoint, to: VectorPoint): string {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  return `${dx},${dy}`;
}

function rotateRight(dir: string): string {
  if (dir === "1,0") return "0,1";
  if (dir === "0,1") return "-1,0";
  if (dir === "-1,0") return "0,-1";
  return "1,0";
}

function rotateLeft(dir: string): string {
  if (dir === "1,0") return "0,-1";
  if (dir === "0,-1") return "-1,0";
  if (dir === "-1,0") return "0,1";
  return "1,0";
}

function pickNextEdge(currentDir: string, candidates: Edge[]): Edge | undefined {
  if (!candidates.length) {
    return undefined;
  }

  const right = rotateRight(currentDir);
  const left = rotateLeft(currentDir);

  let best: Edge | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dir = direction(candidate.start, candidate.end);
    let score = 3;
    if (dir === right) {
      score = 0;
    } else if (dir === currentDir) {
      score = 1;
    } else if (dir === left) {
      score = 2;
    }
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function removeEdge(list: Edge[], edgeId: number): void {
  const index = list.findIndex((edge) => edge.id === edgeId);
  if (index >= 0) {
    list.splice(index, 1);
  }
}

export function maskToPolygons(mask: Uint8Array, width: number, height: number): VectorPoint[][] {
  const edges: Edge[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx]) {
        continue;
      }

      const topEmpty = y === 0 || !mask[idx - width];
      const rightEmpty = x === width - 1 || !mask[idx + 1];
      const bottomEmpty = y === height - 1 || !mask[idx + width];
      const leftEmpty = x === 0 || !mask[idx - 1];

      if (topEmpty) {
        pushEdge(edges, { x, y }, { x: x + 1, y });
      }
      if (rightEmpty) {
        pushEdge(edges, { x: x + 1, y }, { x: x + 1, y: y + 1 });
      }
      if (bottomEmpty) {
        pushEdge(edges, { x: x + 1, y: y + 1 }, { x, y: y + 1 });
      }
      if (leftEmpty) {
        pushEdge(edges, { x, y: y + 1 }, { x, y });
      }
    }
  }

  const byStart = new Map<string, Edge[]>();
  for (const edge of edges) {
    const k = key(edge.start);
    const group = byStart.get(k);
    if (group) {
      group.push(edge);
    } else {
      byStart.set(k, [edge]);
    }
  }

  const polygons: VectorPoint[][] = [];

  while (byStart.size > 0) {
    const firstEntry = byStart.entries().next().value as [string, Edge[]];
    if (!firstEntry) {
      break;
    }
    const [startKey, startEdges] = firstEntry;
    const startEdge = startEdges[0];
    if (!startEdge) {
      byStart.delete(startKey);
      continue;
    }
    removeEdge(startEdges, startEdge.id);
    if (!startEdges.length) {
      byStart.delete(startKey);
    }

    const loop: VectorPoint[] = [startEdge.start, startEdge.end];
    let current = startEdge.end;
    let currentDir = direction(startEdge.start, startEdge.end);
    let guard = 0;

    while (guard < 1_000_000) {
      guard += 1;
      const nextKey = key(current);
      const nextEdges = byStart.get(nextKey);
      if (!nextEdges || nextEdges.length === 0) {
        break;
      }
      const next = pickNextEdge(currentDir, nextEdges);
      if (!next) {
        break;
      }
      removeEdge(nextEdges, next.id);
      if (!nextEdges.length) {
        byStart.delete(nextKey);
      }
      current = next.end;
      currentDir = direction(next.start, next.end);
      if (current.x === loop[0].x && current.y === loop[0].y) {
        break;
      }
      loop.push(current);
    }

    if (loop.length >= 4 && guard < 1_000_000) {
      polygons.push(loop);
    }
  }

  return polygons;
}
