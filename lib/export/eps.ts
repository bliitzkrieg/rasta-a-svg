import type { ConversionResult } from "@/types/vector";

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [
    Number.parseInt(v.slice(0, 2), 16) / 255,
    Number.parseInt(v.slice(2, 4), 16) / 255,
    Number.parseInt(v.slice(4, 6), 16) / 255
  ];
}

export function toEPSLevel2(result: Omit<ConversionResult, "svg" | "eps" | "dxf">): string {
  const lines: string[] = [];
  lines.push("%!PS-Adobe-3.0 EPSF-3.0");
  lines.push(`%%BoundingBox: 0 0 ${Math.ceil(result.width)} ${Math.ceil(result.height)}`);
  lines.push("%%LanguageLevel: 2");
  lines.push("%%Pages: 1");
  lines.push("%%EndComments");
  lines.push("gsave");
  lines.push(`0 ${result.height} translate`);
  lines.push("1 -1 scale");

  for (const layer of result.layers) {
    const [r, g, b] = hexToRgb(layer.color);
    lines.push(`% Layer: ${layer.name}`);
    lines.push(`${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} setrgbcolor`);
    for (const path of layer.paths) {
      if (!path.points.length) {
        continue;
      }
      lines.push("newpath");
      appendContour(lines, path.points);
      for (const hole of path.holes ?? []) {
        appendContour(lines, hole);
      }
      lines.push((path.holes?.length ?? 0) > 0 ? "eofill" : "fill");
    }
  }

  lines.push("grestore");
  lines.push("showpage");
  lines.push("%%EOF");
  return `${lines.join("\n")}\n`;
}

function appendContour(lines: string[], points: { x: number; y: number }[]): void {
  if (!points.length) {
    return;
  }
  const first = points[0];
  lines.push(`${first.x.toFixed(2)} ${first.y.toFixed(2)} moveto`);
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    lines.push(`${p.x.toFixed(2)} ${p.y.toFixed(2)} lineto`);
  }
  lines.push("closepath");
}
