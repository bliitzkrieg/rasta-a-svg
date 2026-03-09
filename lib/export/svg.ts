import type { ConversionResult, VectorPoint } from "@/types/vector";

function alphaHex(opacity: number): string {
  return Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
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
  // Keep small but valid contours eligible for cubic smoothing. The traced
  // raster boundaries often contain short step segments that look jagged if we
  // immediately fall back to polylines.
  if (points.length < 5) {
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

    // Tiny segments are common on traced raster edges. Only force a straight
    // join when they are also genuinely sharp; otherwise let the cubic fit
    // smooth the staircase without introducing obvious corner drift.
    if (sharpJoin || (tinySegment && (a1 < 38 || a2 < 38))) {
      d += `L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
    } else {
      d += `C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} `;
    }
  }
  return `${d}Z`;
}

export function toSVG(
  result: Omit<ConversionResult, "svg" | "eps" | "dxf">,
): string {
  const layerNodes = result.layers
    .map((layer) => {
      const opacity = 1;
      const id = `${layer.color}${alphaHex(opacity)}`;
      const paths = layer.paths
        .filter(
          (path) =>
            Boolean(path.svgPathData) ||
            path.points.length >= 3 ||
            (path.holes?.some((hole) => hole.length >= 3) ?? false),
        )
        .map((path) => {
          const d = path.svgPathData
            ? path.svgPathData
            : [
                path.points.length >= 3 ? toBezierPath(path.points) : "",
                ...(path.holes ?? [])
                  .filter((hole) => hole.length >= 3)
                  .map((hole) => toBezierPath(hole)),
              ]
                .filter(Boolean)
                .join(" ");
          const transform =
            path.svgTranslateX !== undefined || path.svgTranslateY !== undefined
              ? ` transform="translate(${(path.svgTranslateX ?? 0).toFixed(2)} ${(path.svgTranslateY ?? 0).toFixed(2)})"`
              : "";
          return `<path fill="${layer.color}" opacity="${opacity.toFixed(2)}" d="${d}"${transform} />`;
        })
        .join("\n");

      return `<g id="${id}">\n${paths}\n</g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg width="${result.width}pt" height="${result.height}pt" viewBox="0 0 ${result.width} ${result.height}" version="1.1" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">\n${layerNodes}\n</svg>\n`;
}
