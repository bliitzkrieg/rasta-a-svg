import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";

describe("trackEvent", () => {
  beforeEach(() => {
    delete (globalThis as unknown as Record<string, unknown>).window;
  });

  it("forwards the event to window.gtag when available", () => {
    const gtag = vi.fn();
    (globalThis as unknown as Record<string, unknown>).window = { gtag };
    trackEvent("file_download", { format: "svg" });
    expect(gtag).toHaveBeenCalledWith("event", "file_download", {
      format: "svg",
    });
  });

  it("no-ops when gtag is missing", () => {
    (globalThis as unknown as Record<string, unknown>).window = {};
    expect(() => trackEvent("file_upload", { file_count: 2 })).not.toThrow();
  });

  it("no-ops without a window object", () => {
    expect(() => trackEvent("file_upload")).not.toThrow();
  });
});
