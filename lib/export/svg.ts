import type { ConversionResult, VectorPath, VectorPoint } from "@/types/vector";

function alphaHex(opacity: number): string {
  return Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function signedArea(points: VectorPoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function pointInPolygon(point: VectorPoint, polygon: VectorPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y
      && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function toBezierPath(points: VectorPoint[]): string {
  if (points.length < 3) {
    if (!points.length) {
      return "";
    }
    const first = points[0];
    const rest = points
      .slice(1)
      .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
    return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${rest} Z`;
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

type Region = {
  outer: VectorPath;
  holes: VectorPath[];
};

function buildRegions(paths: VectorPath[]): Region[] {
  const polys = paths
    .filter((p) => p.points.length >= 3)
    .map((path, idx) => ({
      idx,
      path,
      absArea: Math.abs(signedArea(path.points)),
      parent: -1,
      depth: 0
    }))
    .sort((a, b) => b.absArea - a.absArea);

  for (let i = 0; i < polys.length; i += 1) {
    const child = polys[i];
    const probe = child.path.points[0];
    let parentIndex = -1;
    let bestArea = Number.POSITIVE_INFINITY;

    for (let j = 0; j < i; j += 1) {
      const candidate = polys[j];
      if (candidate.absArea <= child.absArea) {
        continue;
      }
      if (!pointInPolygon(probe, candidate.path.points)) {
        continue;
      }
      if (candidate.absArea < bestArea) {
        bestArea = candidate.absArea;
        parentIndex = j;
      }
    }

    child.parent = parentIndex;
    child.depth = parentIndex === -1 ? 0 : polys[parentIndex].depth + 1;
  }

  const regionsByOuter = new Map<number, Region>();

  for (let i = 0; i < polys.length; i += 1) {
    const node = polys[i];
    if (node.depth % 2 === 0) {
      regionsByOuter.set(i, { outer: node.path, holes: [] });
      continue;
    }

    let parent = node.parent;
    while (parent !== -1 && polys[parent].depth % 2 !== 0) {
      parent = polys[parent].parent;
    }
    if (parent !== -1 && regionsByOuter.has(parent)) {
      regionsByOuter.get(parent)?.holes.push(node.path);
    }
  }

  return Array.from(regionsByOuter.entries())
    .sort((a, b) => polys[a[0]].absArea - polys[b[0]].absArea)
    .map((entry) => entry[1]);
}

export function toSVG(result: Omit<ConversionResult, "svg" | "eps" | "dxf">): string {
  const layerNodes = result.layers
    .map((layer) => {
      const opacity = 1;
      const id = `${layer.color}${alphaHex(opacity)}`;
      const regions = buildRegions(layer.paths);
      const paths = regions
        .map((region) => {
          const d = [
            toBezierPath(region.outer.points),
            ...region.holes.map((h) => toBezierPath(h.points))
          ].join(" ");
          return `<path fill="${layer.color}" opacity="${opacity.toFixed(2)}" fill-rule="evenodd" d="${d}" />`;
        })
        .join("\n");
      return `<g id="${id}">\n${paths}\n</g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg width="${result.width}pt" height="${result.height}pt" viewBox="0 0 ${result.width} ${result.height}" version="1.1" xmlns="http://www.w3.org/2000/svg">\n${layerNodes}\n</svg>\n`;
}
