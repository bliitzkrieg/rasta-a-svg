import { describe, expect, it } from "vitest";
import { isLeavingLink } from "@/lib/leaveWarning";

describe("isLeavingLink", () => {
  it("stays for in-page anchors", () => {
    expect(isLeavingLink("#gallery", "/")).toBe(false);
    expect(isLeavingLink("#contact", "/vaughan")).toBe(false);
  });

  it("stays for phone and email links", () => {
    expect(isLeavingLink("tel:9057837283", "/")).toBe(false);
    expect(isLeavingLink("mailto:hello@png2svg.io", "/")).toBe(false);
  });

  it("stays for a link to the current page", () => {
    expect(isLeavingLink("/", "/")).toBe(false);
    expect(isLeavingLink("/png-to-eps", "/png-to-eps")).toBe(false);
    expect(isLeavingLink("/png-to-eps/", "/png-to-eps")).toBe(false);
  });

  it("leaves for another converter page, the case in the bug report", () => {
    expect(isLeavingLink("/png-to-eps", "/")).toBe(true);
    expect(isLeavingLink("/png-to-dxf", "/png-to-eps")).toBe(true);
    expect(isLeavingLink("/guides", "/")).toBe(true);
  });

  it("leaves for an external link", () => {
    expect(isLeavingLink("https://example.com/", "/")).toBe(true);
  });

  it("stays when there is no link", () => {
    expect(isLeavingLink(null, "/")).toBe(false);
    expect(isLeavingLink("", "/")).toBe(false);
  });
});
