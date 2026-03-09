import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import { toVTracerOptions } from "@/lib/vectorize/vtracerOptions";

describe("toVTracerOptions", () => {
  it("maps the default UI settings to the VTracer webapp defaults", () => {
    expect(toVTracerOptions(DEFAULT_SETTINGS)).toEqual({
      clusteringMode: "color",
      hierarchical: "stacked",
      colorPrecision: 6,
      filterSpeckle: 4,
      layerDifference: 16,
      cornerThreshold: 60,
      lengthThreshold: 4,
      maxIterations: 10,
      pathPrecision: 8,
      spliceThreshold: 45,
      mode: "none",
    });
  });

  it("preserves binary and cutout modes", () => {
    expect(
      toVTracerOptions({
        ...DEFAULT_SETTINGS,
        clusteringMode: "binary",
        hierarchical: "cutout",
        mode: "none",
      }),
    ).toEqual({
      ...toVTracerOptions(DEFAULT_SETTINGS),
      clusteringMode: "binary",
      hierarchical: "cutout",
      mode: "none",
    });
  });

  it("clamps raw VTracer controls to the webapp ranges", () => {
    expect(
      toVTracerOptions({
        ...DEFAULT_SETTINGS,
        filterSpeckle: 99,
        colorPrecision: 0,
        layerDifference: 999,
        cornerThreshold: -50,
        lengthThreshold: 99,
        spliceThreshold: 999,
        pathPrecision: 99,
      }),
    ).toEqual({
      ...toVTracerOptions(DEFAULT_SETTINGS),
      filterSpeckle: 16,
      colorPrecision: 1,
      layerDifference: 255,
      cornerThreshold: 0,
      lengthThreshold: 10,
      spliceThreshold: 180,
      pathPrecision: 16,
    });
  });
});
