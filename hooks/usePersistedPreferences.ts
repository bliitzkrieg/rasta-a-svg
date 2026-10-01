"use client";

import { useEffect, useState } from "react";
import {
  defaultPersistedState,
  loadPersistedState,
  savePersistedState,
} from "@/lib/storage/localState";
import type {
  ConversionResult,
  ConversionSettings,
  PersistedAppState,
} from "@/types/vector";

/**
 * Hydrates app state from localStorage (preferences only; queue/selection are reset)
 * and persists state changes. The theme is handled by useThemePreference.
 */
export function usePersistedPreferences(
  state: PersistedAppState,
  setState: React.Dispatch<React.SetStateAction<PersistedAppState>>,
  setResults: React.Dispatch<React.SetStateAction<Record<string, ConversionResult>>>,
  /** Settings to start with instead of the saved ones (landing pages). */
  initialSettings?: ConversionSettings,
): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const persisted = loadPersistedState();
    setState({
      ...defaultPersistedState(),
      settings: initialSettings ?? persisted.settings,
      sliderPosition: persisted.sliderPosition,
      theme: persisted.theme ?? "system",
    });
    setResults({});
    setHydrated(true);
  }, [setState, setResults, initialSettings]);

  useEffect(() => {
    if (!hydrated) return;
    savePersistedState(state);
  }, [state, hydrated]);

  return hydrated;
}
