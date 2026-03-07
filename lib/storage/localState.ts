import {
  DEFAULT_SETTINGS,
  type ConversionSettings,
  type PersistedAppState,
  type ThemePreference,
} from "@/types/vector";

const STORAGE_KEY = "r2v-lab-state-v36";

/** Only preferences are persisted; queue and selection are in-memory only. */
export interface StoredPreferences {
  settings: ConversionSettings;
  sliderPosition: number;
  theme: ThemePreference;
}

export function defaultPersistedState(): PersistedAppState {
  return {
    queue: [],
    selectedId: undefined,
    sliderPosition: 50,
    settings: DEFAULT_SETTINGS,
    theme: "system",
  };
}

/**
 * Loads persisted preferences from localStorage. Queue and selectedId are never
 * rehydrated; they are always reset to default (empty / undefined).
 */
export function loadPersistedState(): PersistedAppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPersistedState();
    const parsed = JSON.parse(raw) as Partial<StoredPreferences>;
    return {
      ...defaultPersistedState(),
      settings: {
        ...DEFAULT_SETTINGS,
        ...parsed.settings,
      },
      sliderPosition:
        typeof parsed.sliderPosition === "number" ? parsed.sliderPosition : 50,
      theme: parsed.theme ?? "system",
    };
  } catch {
    return defaultPersistedState();
  }
}

/** Persists only preferences (settings, sliderPosition, theme). Queue/selection are not stored. */
export function savePersistedState(state: PersistedAppState): void {
  const toStore: StoredPreferences = {
    settings: state.settings,
    sliderPosition: state.sliderPosition,
    theme: state.theme ?? "system",
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
}

export function clearPersistedState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
