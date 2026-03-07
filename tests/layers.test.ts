import { describe, expect, it } from "vitest";
import { maskToPolygons } from "@/lib/vectorize/layers";

describe("maskToPolygons", () => {
  it("produces subpixel contour points for diagonal masks", () => {
    const width = 2;
    const height = 2;
    const mask = new Uint8Array([
      1, 0,
      0, 1,
    ]);

    const polygons = maskToPolygons(mask, width, height);

    expect(polygons.length).toBeGreaterThan(0);
    expect(
      polygons.some((polygon) =>
        polygon.some(
          (point) =>
            Math.abs(point.x - Math.round(point.x)) > 1e-6 ||
            Math.abs(point.y - Math.round(point.y)) > 1e-6,
        ),
      ),
    ).toBe(true);
  });
});
