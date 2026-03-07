"use client";

import { useEffect, useState } from "react";
import {
  defaultPersistedState,
  loadPersistedState,
  savePersistedState,
} from "@/lib/storage/localState";
import type {
  ConversionResult,
  PersistedAppState,
} from "@/types/vector";

/**
 * Hydrates app state from localStorage (preferences only; queue/selection are reset)
 * and persists state changes. Also syncs theme to document.
 */
export function usePersistedPreferences(
  state: PersistedAppState,
  setState: React.Dispatch<React.SetStateAction<PersistedAppState>>,
  setResults: React.Dispatch<React.SetStateAction<Record<string, ConversionResult>>>,
): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persisted = loadPersistedState();
    setState({
      ...defaultPersistedState(),
      settings: persisted.settings,
      sliderPosition: persisted.sliderPosition,
      theme: persisted.theme ?? "system",
    });
    setResults({});
    setHydrated(true);
  }, [setState, setResults]);

  useEffect(() => {
    if (!hydrated) return;
    savePersistedState(state);
  }, [state, hydrated]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const preference = state.theme ?? "system";
    const resolved =
      preference === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : preference;
    document.documentElement.setAttribute("data-theme", resolved);
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      document.documentElement.setAttribute(
        "data-theme",
        mq.matches ? "dark" : "light",
      );
    };
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [state.theme]);

  return hydrated;
}
