import type { ConversionResult } from "@/types/vector";

function alphaHex(opacity: number): string {
  return Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function pathData(points: Array<{ x: number; y: number }>): string {
  if (!points.length) {
    return "";
  }
  const start = points[0];
  const n = points.length;
  let d = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} `;
  for (let i = 0; i < n; i += 1) {
    const p = points[(i + 1) % n];
    d += `L ${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
  }
  return `${d}Z`;
}

export function toSVG(result: Omit<ConversionResult, "svg" | "eps" | "dxf">): string {
  const layerNodes = result.layers
    .map((layer) => {
      const opacity = 1;
      const id = `${layer.color}${alphaHex(opacity)}`;
      const paths = layer.paths
        .map(
          (path) =>
            `<path fill="${layer.color}" opacity="${opacity.toFixed(2)}" fill-rule="evenodd" d=" ${pathData(path.points)}" />`
        )
        .join("");
      return `<g id="${id}">${paths}</g>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<!-- generator: r2v-linear-v7 -->\n<svg width="${result.width}pt" height="${result.height}pt" viewBox="0 0 ${result.width} ${result.height}" version="1.1" xmlns="http://www.w3.org/2000/svg">\n${layerNodes}\n</svg>\n`;
}




