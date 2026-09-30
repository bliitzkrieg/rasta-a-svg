import { describe, expect, it } from "vitest";
import {
  chooseTrace,
  pickSmallerPath,
} from "@/lib/vectorize/chooseTrace";

describe("chooseTrace", () => {
  it("traces both paths for a tier image in color mode", () => {
    const routing = chooseTrace(16, "color");
    expect(routing.paths).toEqual(["binary", "color"]);
    expect(routing.appPath).toBeNull();
  });

  it("traces only the color path for a tier image in B/W mode", () => {
    const routing = chooseTrace(16, "binary");
    expect(routing.paths).toEqual(["color"]);
    expect(routing.appPath).toBe("color");
  });

  it("traces only the color path when no tier fires", () => {
    expect(chooseTrace(null, "color")).toEqual({
      paths: ["color"],
      appPath: "color",
    });
    expect(chooseTrace(null, "binary")).toEqual({
      paths: ["color"],
      appPath: "color",
    });
  });
});

describe("pickSmallerPath", () => {
  it("picks binary when smaller or tied (both exact)", () => {
    expect(
      pickSmallerPath(
        { svgLength: 100, pixelExact: "exact" },
        { svgLength: 200, pixelExact: "exact" },
      ),
    ).toBe("binary");
    expect(
      pickSmallerPath(
        { svgLength: 100, pixelExact: "exact" },
        { svgLength: 100, pixelExact: "exact" },
      ),
    ).toBe("binary");
  });

  it("picks color when smaller (both exact)", () => {
    expect(
      pickSmallerPath(
        { svgLength: 200, pixelExact: "exact" },
        { svgLength: 100, pixelExact: "exact" },
      ),
    ).toBe("color");
  });

  it("prefers exact over smaller-but-simplified (Polygon mode regression)", () => {
    // Binary stays exact in Polygon mode; color is simplified and smaller.
    // The exact binary output must win despite being larger.
    expect(
      pickSmallerPath(
        { svgLength: 2750000, pixelExact: "exact" },
        { svgLength: 330000, pixelExact: "simplified" },
      ),
    ).toBe("binary");
  });

  it("prefers exact over capped when sizes tie", () => {
    expect(
      pickSmallerPath(
        { svgLength: 100, pixelExact: "capped" },
        { svgLength: 100, pixelExact: "exact" },
      ),
    ).toBe("color");
  });

  it("picks smaller among same non-exact reasons", () => {
    expect(
      pickSmallerPath(
        { svgLength: 200, pixelExact: "simplified" },
        { svgLength: 100, pixelExact: "simplified" },
      ),
    ).toBe("color");
  });
});
