import { describe, expect, it } from "vitest";
import { toDXF } from "@/lib/export/dxf";
import { toEPSLevel2 } from "@/lib/export/eps";
import { toSVG } from "@/lib/export/svg";

const baseResult = {
  width: 100,
  height: 100,
  layers: [
    {
      name: "COLOR_01",
      color: "#ff0000",
      paths: [
        {
          points: [
            { x: 10, y: 10 },
            { x: 90, y: 10 },
            { x: 90, y: 90 },
            { x: 10, y: 90 }
          ],
          closed: true,
          nodeCount: 4
        }
      ]
    }
  ],
  metrics: {
    nodeCount: 4,
    pathCount: 1,
    elapsedMs: 1
  }
};

describe("vector exporters", () => {
  it("builds svg with grouped layer paths", () => {
    const svg = toSVG(baseResult);
    expect(svg).toContain("<svg");
    expect(svg).toContain('<g id="#ff0000ff">');
    expect(svg).toContain("#ff0000");
  });

  it("uses cubic segments for staircase contours", () => {
    const svg = toSVG({
      ...baseResult,
      layers: [
        {
          name: "COLOR_01",
          color: "#ff0000",
          paths: [
            {
              points: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 1, y: 1 },
                { x: 2, y: 1 },
                { x: 2, y: 2 },
                { x: 3, y: 2 },
                { x: 3, y: 3 },
                { x: 0, y: 3 }
              ],
              closed: true,
              nodeCount: 8
            }
          ]
        }
      ]
    });

    expect(svg).toContain("C ");
  });

  it("builds eps level 2 commands", () => {
    const eps = toEPSLevel2(baseResult);
    expect(eps).toContain("EPSF-3.0");
    expect(eps).toContain("% Layer: COLOR_01");
    expect(eps).toContain("closepath fill");
  });

  it("builds dxf with layers and lwpolyline", () => {
    const dxf = toDXF(baseResult);
    expect(dxf).toContain("SECTION");
    expect(dxf).toContain("LWPOLYLINE");
    expect(dxf).toContain("COLOR_01");
  });
});
