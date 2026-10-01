/**
 * The png2svg.io mark: a circle whose left half is rasterized into pixel
 * cells and whose right half is a perfect vector semicircle.
 *
 * The cells are computed from the circle (a cell is drawn when its center
 * lies inside it), so the "pixel" half is a true rasterization of the same
 * shape the "vector" half draws exactly. Shared by components/Logo.tsx and
 * scripts/build-brand.ts so every asset matches.
 */

export const BRAND = {
  ink: "#12161C",
  blue: "#2281B3",
  orange: "#FB6A15",
} as const;

const VIEWBOX = 64;
const CENTER = 32;
const RADIUS = 22;

export interface MarkOptions {
  /** "fine" for large sizes, "coarse" keeps the steps legible at 16-32 px. */
  detail?: "fine" | "coarse";
  /** Tile corner radius in viewBox units (0 = full-bleed square). */
  cornerRadius?: number;
}

export interface MarkGeometry {
  cells: { x: number; y: number; size: number }[];
  arcPath: string;
  cornerRadius: number;
}

export function markGeometry({ detail = "fine", cornerRadius = 15 }: MarkOptions = {}): MarkGeometry {
  const cell = detail === "fine" ? 5.5 : 7.34;
  const gap = detail === "fine" ? 1 : 1.4;
  const n = Math.ceil(RADIUS / cell) + 1;
  const cells: MarkGeometry["cells"] = [];
  for (let i = -n; i < 0; i += 1) {
    for (let j = -n; j < n; j += 1) {
      const x0 = CENTER + i * cell;
      const y0 = CENTER + j * cell;
      const mx = x0 + cell / 2;
      const my = y0 + cell / 2;
      if (Math.hypot(mx - CENTER, my - CENTER) <= RADIUS) {
        cells.push({
          x: round(x0 + gap / 2),
          y: round(y0 + gap / 2),
          size: round(cell - gap),
        });
      }
    }
  }
  const arcPath = `M${CENTER} ${CENTER - RADIUS}A${RADIUS} ${RADIUS} 0 0 1 ${CENTER} ${CENTER + RADIUS}Z`;
  return { cells, arcPath, cornerRadius };
}

/** Standalone SVG document for the mark. */
export function markSvg(options: MarkOptions = {}): string {
  const { cells, arcPath, cornerRadius } = markGeometry(options);
  const rects = cells
    .map((c) => `<rect x="${c.x}" y="${c.y}" width="${c.size}" height="${c.size}" rx="1"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">` +
    `<rect width="${VIEWBOX}" height="${VIEWBOX}" rx="${cornerRadius}" fill="${BRAND.ink}"/>` +
    `<g fill="${BRAND.blue}">${rects}</g>` +
    `<path d="${arcPath}" fill="${BRAND.orange}"/>` +
    `</svg>`
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
