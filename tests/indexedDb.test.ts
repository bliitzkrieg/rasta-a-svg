import { describe, expect, it } from "vitest";
import {
  isOrphanKey,
  keyTabId,
  pruneLiveTabs,
  tabKey,
} from "@/lib/storage/indexedDb";

describe("per-tab IndexedDB isolation", () => {
  it("namespaces keys by tab so two tabs never share a key", () => {
    expect(tabKey("tab-a", "item-1")).toBe("tab-a:item-1");
    expect(tabKey("tab-b", "item-1")).toBe("tab-b:item-1");
    expect(tabKey("tab-a", "item-1")).not.toBe(tabKey("tab-b", "item-1"));
  });

  it("reads the tab id back out of a namespaced key", () => {
    expect(keyTabId("tab-a:item-1")).toBe("tab-a");
    expect(keyTabId("item-1")).toBeNull();
  });

  it("prunes live-tab entries that stopped heartbeating", () => {
    const now = 1_000_000;
    const pruned = pruneLiveTabs(
      { fresh: now - 60_000, stale: now - 6 * 60_000, "tab-a": now },
      now,
    );
    expect(pruned).toEqual({ fresh: now - 60_000, "tab-a": now });
  });

  it("never treats this tab's keys or a live tab's keys as orphans", () => {
    const now = 1_000_000;
    const live = { "tab-a": now, "tab-b": now - 60_000 };
    expect(isOrphanKey("tab-a:item-1", "tab-a", live, now)).toBe(false);
    expect(isOrphanKey("tab-b:item-1", "tab-a", live, now)).toBe(false);
  });

  it("treats keys of tabs that never registered or went stale as orphans", () => {
    const now = 1_000_000;
    const live = { "tab-a": now, "tab-b": now - 60_000 };
    expect(isOrphanKey("tab-c:item-1", "tab-a", live, now)).toBe(true);
    expect(
      isOrphanKey("tab-b:item-1", "tab-a", { "tab-a": now, "tab-b": now - 6 * 60_000 }, now),
    ).toBe(true);
  });

  it("treats legacy bare keys as orphans so pre-namespacing data gets cleaned up", () => {
    const now = 1_000_000;
    expect(isOrphanKey("item-1", "tab-a", { "tab-a": now }, now)).toBe(true);
  });
});
