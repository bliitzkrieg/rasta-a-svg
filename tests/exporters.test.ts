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
    elapsedMs: 1,
    pixelExact: "exact" as const
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
    expect(eps).toContain("closepath");
    expect(eps).toContain("fill");
  });

  it("uses eofill for paths with holes", () => {
    const eps = toEPSLevel2({
      ...baseResult,
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
              holes: [[
                { x: 30, y: 30 },
                { x: 70, y: 30 },
                { x: 70, y: 70 },
                { x: 30, y: 70 }
              ]],
              closed: true,
              nodeCount: 8
            }
          ]
        }
      ]
    });

    expect(eps).toContain("eofill");
  });

  it("builds dxf with layers and lwpolyline", () => {
    const dxf = toDXF(baseResult);
    expect(dxf).toContain("SECTION");
    expect(dxf).toContain("LWPOLYLINE");
    expect(dxf).toContain("COLOR_01");
  });

  it("emits dxf lwpolylines strict parsers can read back", () => {
    const dxf = toDXF(baseResult);
    const raw = dxf.trim().split("\n");
    const tags: Array<[string, string]> = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      tags.push([raw[i].trim(), raw[i + 1].trim()]);
    }

    const headerVersion = tags.findIndex(
      ([code, value]) => code === "9" && value === "$ACADVER",
    );
    expect(headerVersion).toBeGreaterThan(-1);
    expect(tags[headerVersion + 1]).toEqual(["1", "AC1015"]);

    const entityStarts = tags
      .map(([code, value], i) => (code === "0" && value === "LWPOLYLINE" ? i : -1))
      .filter((i) => i >= 0);
    expect(entityStarts).toHaveLength(1);

    const start = entityStarts[0];
    const entityTags = tags.slice(start);
    const end = entityTags.findIndex(
      ([code, value]) => code === "0" && value !== "LWPOLYLINE",
    );
    const body = entityTags.slice(0, end === -1 ? undefined : end);

    const acDbEntity = body.findIndex(
      ([code, value]) => code === "100" && value === "AcDbEntity",
    );
    const acDbPolyline = body.findIndex(
      ([code, value]) => code === "100" && value === "AcDbPolyline",
    );
    expect(acDbEntity).toBeGreaterThan(-1);
    expect(acDbPolyline).toBeGreaterThan(acDbEntity);
    expect(body[acDbEntity + 1]).toEqual(["8", "COLOR_01"]);
    expect(body[acDbPolyline + 1]).toEqual(["90", "4"]);
    expect(body[acDbPolyline + 2]).toEqual(["70", "1"]);

    const vertices = body.filter(([code]) => code === "10").map(([, v]) => v);
    expect(vertices).toEqual(["10.0000", "90.0000", "90.0000", "10.0000"]);
  });

  it("handles result with no layers without throwing", () => {
    const emptyResult = { ...baseResult, layers: [] };
    expect(() => toSVG(emptyResult)).not.toThrow();
    expect(() => toEPSLevel2(emptyResult)).not.toThrow();
    expect(() => toDXF(emptyResult)).not.toThrow();
    expect(toSVG(emptyResult)).toContain("<svg");
  });

  it("handles layer with empty paths", () => {
    const noPaths = {
      ...baseResult,
      layers: [{ name: "EMPTY", color: "#000000", paths: [] }],
    };
    expect(() => toSVG(noPaths)).not.toThrow();
    expect(() => toEPSLevel2(noPaths)).not.toThrow();
    expect(() => toDXF(noPaths)).not.toThrow();
  });
});
