import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import { toVTracerOptions } from "@/lib/vectorize/vtracerOptions";

describe("toVTracerOptions", () => {
  it("maps the default UI settings to valid vtracer parameters", () => {
    expect(toVTracerOptions(DEFAULT_SETTINGS)).toEqual({
      colorPrecision: 8,
      filterSpeckle: 4,
      layerDifference: 16,
      cornerThreshold: 60,
      lengthThreshold: 4,
      maxIterations: 10,
      pathPrecision: 2,
      spliceThreshold: 45,
      mode: "spline",
    });
  });

  it("switches to polygon mode for minimal-nodes", () => {
    expect(
      toVTracerOptions({
        ...DEFAULT_SETTINGS,
        optimizePreset: "minimal-nodes",
      }).mode,
    ).toBe("polygon");
  });
});
