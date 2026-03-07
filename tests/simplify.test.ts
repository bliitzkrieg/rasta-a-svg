import { describe, expect, it } from "vitest";
import { simplifyPath } from "@/lib/vectorize/simplify";

describe("simplifyPath", () => {
  it("reduces point count while keeping polygon", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 4, y: 4 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
      { x: 0, y: 2 }
    ];
    const simplified = simplifyPath(points, 1.2, 0.2, 22);
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified.length).toBeGreaterThanOrEqual(3);
  });

  it("adds rounded detail when smoothing is enabled", () => {
    const staircase = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 0, y: 3 }
    ];

    const unsmoothed = simplifyPath(staircase, 0.5, 0, 22);
    const smoothed = simplifyPath(staircase, 0.5, 0.24, 22);

    expect(smoothed.length).toBeGreaterThan(unsmoothed.length);
    expect(
      smoothed.some(
        (point) =>
          Math.abs(point.x - Math.round(point.x)) > 1e-6 ||
          Math.abs(point.y - Math.round(point.y)) > 1e-6,
      ),
    ).toBe(true);
  });
});
