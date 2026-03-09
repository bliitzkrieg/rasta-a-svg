import type { ConversionResult } from "@/types/vector";

function add(lines: string[], code: number | string, value: number | string): void {
  lines.push(String(code));
  lines.push(String(value));
}

export function toDXF(result: Omit<ConversionResult, "svg" | "eps" | "dxf">): string {
  const lines: string[] = [];
  add(lines, 0, "SECTION");
  add(lines, 2, "HEADER");
  add(lines, 0, "ENDSEC");

  add(lines, 0, "SECTION");
  add(lines, 2, "TABLES");
  add(lines, 0, "TABLE");
  add(lines, 2, "LAYER");
  add(lines, 70, result.layers.length + 1);

  add(lines, 0, "LAYER");
  add(lines, 2, "0");
  add(lines, 70, 0);
  add(lines, 62, 7);
  add(lines, 6, "CONTINUOUS");

  result.layers.forEach((layer, idx) => {
    add(lines, 0, "LAYER");
    add(lines, 2, layer.name);
    add(lines, 70, 0);
    add(lines, 62, (idx % 255) + 1);
    add(lines, 6, "CONTINUOUS");
  });

  add(lines, 0, "ENDTAB");
  add(lines, 0, "ENDSEC");

  add(lines, 0, "SECTION");
  add(lines, 2, "ENTITIES");

  for (const layer of result.layers) {
    for (const path of layer.paths) {
      if (!path.points.length) {
        continue;
      }
      const contours = [path.points, ...(path.holes ?? [])];
      for (const contour of contours) {
        if (!contour.length) {
          continue;
        }
        add(lines, 0, "LWPOLYLINE");
        add(lines, 8, layer.name);
        add(lines, 90, contour.length);
        add(lines, 70, path.closed ? 1 : 0);
        for (const point of contour) {
          add(lines, 10, point.x.toFixed(4));
          add(lines, 20, (result.height - point.y).toFixed(4));
        }
      }
    }
  }

  add(lines, 0, "ENDSEC");
  add(lines, 0, "EOF");
  return `${lines.join("\n")}\n`;
}
