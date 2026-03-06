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
});
