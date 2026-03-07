import type { ConversionResult, VectorPoint } from "@/types/vector";

function alphaHex(opacity: number): string {
  return Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
}

// Catmull-Rom → cubic bezier (matches CLI toBezier)
function toBezierPath(points: VectorPoint[]): string {
  if (points.length < 3) {
    const first = points[0];
    const rest = points.slice(1).map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
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

export function toSVG(result: Omit<ConversionResult, "svg" | "eps" | "dxf">): string {
  const layerNodes = result.layers
    .map((layer) => {
      if (!layer.paths.length) return "";
      const opacity = 1;
      const id = `${layer.color}${alphaHex(opacity)}`;
      // Combine ALL subpaths for this layer into ONE <path> with evenodd fill rule.
      // This correctly renders holes (eye pupils, wing cutouts, etc.) as transparent cutouts
      // instead of filled shapes — the key fix for missing interior detail.
      const combinedD = layer.paths.map((p) => toBezierPath(p.points)).join(" ");
      return `<g id="${id}"><path fill="${layer.color}" opacity="${opacity.toFixed(2)}" fill-rule="evenodd" d="${combinedD}" /></g>`;
    })
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg width="${result.width}pt" height="${result.height}pt" viewBox="0 0 ${result.width} ${result.height}" version="1.1" xmlns="http://www.w3.org/2000/svg">\n${layerNodes}\n</svg>\n`;
}
