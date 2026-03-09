import { describe, expect, it } from "vitest";
import { toSVG } from "@/lib/export/svg";
import type { ConversionResult, VectorPath, VectorPoint } from "@/types/vector";

function square(min: number, max: number): VectorPoint[] {
  return [
    { x: min, y: min },
    { x: max, y: min },
    { x: max, y: max },
    { x: min, y: max },
  ];
}

function path(points: VectorPoint[]): VectorPath {
  return {
    points,
    closed: true,
    nodeCount: points.length,
  };
}

function baseResult(paths: ConversionResult["layers"]): Omit<ConversionResult, "svg" | "eps" | "dxf"> {
  return {
    width: 100,
    height: 100,
    layers: paths,
    metrics: {
      nodeCount: 0,
      pathCount: 0,
      elapsedMs: 0,
    },
  };
}

describe("toSVG export behavior", () => {
  it("preserves incoming layer order", () => {
    const svg = toSVG(
      baseResult([
        {
          name: "outline",
          color: "#000000",
          paths: [path(square(10, 90))],
        },
        {
          name: "fill",
          color: "#fffdff",
          paths: [path(square(20, 80))],
        },
      ]),
    );

    expect(svg.indexOf('<g id="#000000ff">')).toBeLessThan(
      svg.indexOf('<g id="#fffdffff">'),
    );
  });

  it("emits one svg path per vector path without synthetic hole merging", () => {
    const svg = toSVG(
      baseResult([
        {
          name: "fill",
          color: "#f1b856",
          paths: [path(square(10, 90)), path(square(30, 70))],
        },
      ]),
    );

    expect((svg.match(/<path /g) ?? []).length).toBe(2);
    expect(svg).not.toContain('fill-rule="evenodd"');
  });

  it("does not add seam-closing stroke attributes", () => {
    const svg = toSVG(
      baseResult([
        {
          name: "outline",
          color: "#000000",
          paths: [path(square(10, 90))],
        },
      ]),
    );

    expect(svg).not.toContain("stroke=");
    expect(svg).not.toContain("paint-order=");
  });

  it("uses exact path data from vtracer output when provided", () => {
    const svg = toSVG(
      baseResult([
        {
          name: "fill",
          color: "#f55255",
          paths: [
            {
              points: [],
              holes: [],
              closed: true,
              nodeCount: 4,
              svgPathData: "M0 0 L10 0 L10 10 Z ",
              svgTranslateX: 5,
              svgTranslateY: 6,
            },
          ],
        },
      ]),
    );

    expect(svg).toContain('d="M0 0 L10 0 L10 10 Z "');
    expect(svg).toContain('transform="translate(5.00 6.00)"');
  });
});
