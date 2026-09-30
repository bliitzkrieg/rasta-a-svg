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
  it("picks binary when smaller or tied", () => {
    expect(pickSmallerPath(100, 200)).toBe("binary");
    expect(pickSmallerPath(100, 100)).toBe("binary");
  });

  it("picks color when smaller", () => {
    expect(pickSmallerPath(200, 100)).toBe("color");
  });
});
