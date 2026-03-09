import { describe, expect, it } from "vitest";
import {
  capLayerPathsByArea,
  layerPrimaryPathArea,
  normalizeLayerColor,
} from "@/lib/vectorize/workerHelpers";

describe("capLayerPathsByArea", () => {
  it("keeps the largest paths for non-dark layers", () => {
    const paths = [
      { id: "a", area: 50 },
      { id: "b", area: 10 },
      { id: "c", area: 30 },
    ];

    expect(capLayerPathsByArea(paths, false, 2).map((path) => path.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("reserves small detail paths for dark outline layers", () => {
    const paths = [
      { id: "large-1", area: 500 },
      { id: "large-2", area: 400 },
      { id: "large-3", area: 300 },
      { id: "detail-1", area: 16 },
      { id: "detail-2", area: 24 },
      { id: "detail-3", area: 40 },
      { id: "tiny", area: 4 },
    ];

    expect(capLayerPathsByArea(paths, true, 5).map((path) => path.id)).toEqual([
      "large-1",
      "large-2",
      "large-3",
      "detail-1",
      "detail-2",
    ]);
  });

  it("normalizes near-black quantized layers to pure black", () => {
    expect(normalizeLayerColor("#010000")).toBe("#000000");
    expect(normalizeLayerColor("#1c1817")).toBe("#000000");
    expect(normalizeLayerColor("#ad6539")).toBe("#ad6539");
  });

  it("scores layer order by the largest silhouette, not summed fragments", () => {
    expect(
      layerPrimaryPathArea({
        name: "COLOR_01",
        color: "#ffffff",
        paths: [
          {
            closed: true,
            nodeCount: 4,
            points: [
              { x: 0, y: 0 },
              { x: 8, y: 0 },
              { x: 8, y: 8 },
              { x: 0, y: 8 },
            ],
          },
          {
            closed: true,
            nodeCount: 4,
            points: [
              { x: 20, y: 20 },
              { x: 26, y: 20 },
              { x: 26, y: 26 },
              { x: 20, y: 26 },
            ],
          },
        ],
      }),
    ).toBe(64);
  });
});
