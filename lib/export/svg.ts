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
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function toPolylinePath(points: VectorPoint[]): string {
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

function dist(a: VectorPoint, b: VectorPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cornerAngle(
  prev: VectorPoint,
  curr: VectorPoint,
  next: VectorPoint,
): number {
  const ax = prev.x - curr.x;
  const ay = prev.y - curr.y;
  const bx = next.x - curr.x;
  const by = next.y - curr.y;
  const ma = Math.hypot(ax, ay);
  const mb = Math.hypot(bx, by);
  if (ma === 0 || mb === 0) {
    return 180;
  }
  const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (ma * mb)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function clampHandle(
  anchor: VectorPoint,
  control: VectorPoint,
  maxDist: number,
): VectorPoint {
  if (maxDist <= 0) {
    return { ...anchor };
  }
  const dx = control.x - anchor.x;
  const dy = control.y - anchor.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxDist || d === 0) {
    return control;
  }
  const s = maxDist / d;
  return { x: anchor.x + dx * s, y: anchor.y + dy * s };
}

function toBezierPath(points: VectorPoint[]): string {
  // For tiny rings, prefer straight segments to avoid micro-loop/slice artifacts.
  if (points.length < 8) {
    return toPolylinePath(points);
  }
  const n = points.length;
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} `;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    let c1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6,
    };
    let c2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6,
    };

    // Clamp control handles to prevent overshoot loops/sliver wedges on thin outlines.
    const seg = Math.max(0.001, dist(p1, p2));
    const in1 = Math.max(0.001, dist(p0, p1));
    const out2 = Math.max(0.001, dist(p2, p3));
    const maxH1 = 0.6 * Math.min(seg, in1);
    const maxH2 = 0.6 * Math.min(seg, out2);
    c1 = clampHandle(p1, c1, maxH1);
    c2 = clampHandle(p2, c2, maxH2);

    // Join/corner safeguard: if either side is high-curvature (tight joint),
    // avoid cubic smoothing on this segment to prevent tiny missing wedge slices.
    const a1 = cornerAngle(p0, p1, p2);
    const a2 = cornerAngle(p1, p2, p3);
    const sharpJoin = a1 < 58 || a2 < 58;
    const tinySegment = seg < 1.25;

    if (sharpJoin || tinySegment) {
      d += `L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
    } else {
      d += `C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
    }
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
      depth: 0,
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

export function toSVG(
  result: Omit<ConversionResult, "svg" | "eps" | "dxf">,
): string {
  function isExactBlack(hex: string): boolean {
    return hex.replace("#", "").toLowerCase() === "000000";
  }

  function hexLuminance(hex: string): number {
    const value = hex.replace("#", "");
    const r = Number.parseInt(value.slice(0, 2), 16) || 0;
    const g = Number.parseInt(value.slice(2, 4), 16) || 0;
    const b = Number.parseInt(value.slice(4, 6), 16) || 0;
    return r * 0.299 + g * 0.587 + b * 0.114;
  }

  function strokeWidthForResult(width: number, height: number): number {
    const size = Math.max(width, height);
    if (size <= 256) return 0.4;
    if (size <= 768) return 0.55;
    return 0.7;
  }

  const blackStrokeWidth = strokeWidthForResult(result.width, result.height);

  // Render lighter/fill layers first, darkest layers last.
  // This ensures outlines sit on top instead of getting clipped by fills.
  const orderedLayers = [...result.layers].sort((a, b) => {
    const aBlack = isExactBlack(a.color);
    const bBlack = isExactBlack(b.color);

    if (aBlack && !bBlack) return 1;
    if (!aBlack && bBlack) return -1;

    return hexLuminance(b.color) - hexLuminance(a.color);
  });

  const layerNodes = orderedLayers
    .map((layer) => {
      const opacity = 1;
      const id = `${layer.color}${alphaHex(opacity)}`;
      const useSeamStroke = isExactBlack(layer.color);
      const regions = buildRegions(layer.paths);

      const paths = regions
        .map((region) => {
          const d = [
            toBezierPath(region.outer.points),
            ...region.holes.map((h) => toBezierPath(h.points)),
          ].join(" ");

          if (useSeamStroke) {
            return `<path fill="${layer.color}" opacity="${opacity.toFixed(2)}" fill-rule="evenodd" stroke="${layer.color}" stroke-width="${blackStrokeWidth.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill" d="${d}" />`;
          }

          return `<path fill="${layer.color}" opacity="${opacity.toFixed(2)}" fill-rule="evenodd" d="${d}" />`;
        })
        .join("\n");

      return `<g id="${id}">\n${paths}\n</g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg width="${result.width}pt" height="${result.height}pt" viewBox="0 0 ${result.width} ${result.height}" version="1.1" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">\n${layerNodes}\n</svg>\n`;
}
