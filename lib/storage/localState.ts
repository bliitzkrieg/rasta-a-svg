import { DEFAULT_SETTINGS } from "@/lib/vectorize/defaultSettings";
import type {
  ConversionSettings,
  PersistedAppState,
  ThemePreference,
} from "@/types/vector";

const STORAGE_KEY = "r2v-lab-state-v37";

const LEGACY_DEFAULT_SETTINGS: ConversionSettings = {
  paletteMode: "fixed",
  paletteSize: 16,
  smoothing: 0.28,
  speckleThresholdPx: 4,
  simplifyTolerancePx: 2.2,
  cornerThresholdDeg: 40,
  optimizePreset: "fidelity",
};

function matchesLegacyDefaults(
  settings: Partial<ConversionSettings> | undefined,
): boolean {
  if (!settings) {
    return false;
  }

  return (
    settings.paletteMode === LEGACY_DEFAULT_SETTINGS.paletteMode &&
    settings.paletteSize === LEGACY_DEFAULT_SETTINGS.paletteSize &&
    settings.smoothing === LEGACY_DEFAULT_SETTINGS.smoothing &&
    settings.speckleThresholdPx === LEGACY_DEFAULT_SETTINGS.speckleThresholdPx &&
    settings.simplifyTolerancePx === LEGACY_DEFAULT_SETTINGS.simplifyTolerancePx &&
    settings.cornerThresholdDeg === LEGACY_DEFAULT_SETTINGS.cornerThresholdDeg &&
    settings.optimizePreset === LEGACY_DEFAULT_SETTINGS.optimizePreset
  );
}

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
    const mergedSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed.settings,
    };

    return {
      ...defaultPersistedState(),
      settings: matchesLegacyDefaults(parsed.settings)
        ? DEFAULT_SETTINGS
        : mergedSettings,
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
