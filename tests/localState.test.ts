import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPersistedState,
  defaultPersistedState,
  loadPersistedState,
  savePersistedState,
} from "@/lib/storage/localState";
import type { PersistedAppState } from "@/types/vector";

describe("localState", () => {
  const storageKey = "r2v-lab-state-v36";

  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem(key: string) {
        return data.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        data.set(key, value);
      },
      removeItem(key: string) {
        data.delete(key);
      },
      clear() {
        data.clear();
      },
      get length() {
        return data.size;
      },
      key() {
        return null;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("defaultPersistedState", () => {
    it("returns state with empty queue and default settings", () => {
      const state = defaultPersistedState();
      expect(state.queue).toEqual([]);
      expect(state.selectedId).toBeUndefined();
      expect(state.sliderPosition).toBe(50);
      expect(state.theme).toBe("system");
      expect(state.settings).toBeDefined();
      expect(state.settings.paletteSize).toBe(16);
    });
  });

  describe("loadPersistedState", () => {
    it("returns default state when localStorage is empty", () => {
      const state = loadPersistedState();
      expect(state).toEqual(defaultPersistedState());
    });

    it("returns default state when stored value is invalid JSON", () => {
      (globalThis.localStorage as Storage).setItem(
        storageKey,
        "not json",
      );
      const state = loadPersistedState();
      expect(state).toEqual(defaultPersistedState());
    });

    it("merges stored preferences with defaults", () => {
      const stored: Partial<PersistedAppState> = {
        sliderPosition: 75,
        theme: "dark",
        settings: { ...defaultPersistedState().settings, paletteSize: 8 },
      };
      (globalThis.localStorage as Storage).setItem(
        storageKey,
        JSON.stringify(stored),
      );
      const state = loadPersistedState();
      expect(state.sliderPosition).toBe(75);
      expect(state.theme).toBe("dark");
      expect(state.settings.paletteSize).toBe(8);
      expect(state.queue).toEqual([]);
    });

    it("preserves theme when provided", () => {
      (globalThis.localStorage as Storage).setItem(
        storageKey,
        JSON.stringify({ theme: "light" }),
      );
      const state = loadPersistedState();
      expect(state.theme).toBe("light");
    });
  });

  describe("savePersistedState and clearPersistedState", () => {
    it("persists state so loadPersistedState returns merged data", () => {
      const state: PersistedAppState = {
        ...defaultPersistedState(),
        sliderPosition: 30,
        theme: "dark",
      };
      savePersistedState(state);
      const loaded = loadPersistedState();
      expect(loaded.sliderPosition).toBe(30);
      expect(loaded.theme).toBe("dark");
    });

    it("clearPersistedState removes key so load returns default", () => {
      savePersistedState({ ...defaultPersistedState(), sliderPosition: 99 });
      clearPersistedState();
      const loaded = loadPersistedState();
      expect(loaded).toEqual(defaultPersistedState());
    });
  });
});
