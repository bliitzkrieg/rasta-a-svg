import type { VectorPoint } from "@/types/vector";

interface Edge {
  start: VectorPoint;
  end: VectorPoint;
}

function key(point: VectorPoint): string {
  return `${point.x},${point.y}`;
}

// Match CLI maskToPolygons behavior exactly.
export function maskToPolygons(mask: Uint8Array, width: number, height: number): VectorPoint[][] {
  const edges: Edge[] = [];

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

  const byStart = new Map<string, Edge[]>();
  for (const e of edges) {
    const k = key(e.start);
    const v = byStart.get(k) ?? [];
    v.push(e);
    byStart.set(k, v);
  }

  const polygons: VectorPoint[][] = [];

  while (byStart.size > 0) {
    const first = byStart.entries().next().value as [string, Edge[]] | undefined;
    if (!first) {
      break;
    }
    const [startKey, startEdges] = first;
    const edge = startEdges.pop();
    if (!edge) {
      byStart.delete(startKey);
      continue;
    }
    if (!startEdges.length) {
      byStart.delete(startKey);
    }

    const loop: VectorPoint[] = [edge.start, edge.end];
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
      if (!next) {
        break;
      }
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
