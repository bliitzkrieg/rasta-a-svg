import { DEFAULT_SETTINGS, type PersistedAppState } from "@/types/vector";

const STORAGE_KEY = "r2v-lab-state-v20";

export function defaultPersistedState(): PersistedAppState {
  return {
    queue: [],
    selectedId: undefined,
    sliderPosition: 50,
    settings: DEFAULT_SETTINGS
  };
}

export function loadPersistedState(): PersistedAppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultPersistedState();
    }
    const parsed = JSON.parse(raw) as PersistedAppState;
    return {
      ...defaultPersistedState(),
      ...parsed,
      settings: {
        ...DEFAULT_SETTINGS,
        ...parsed.settings
      }
    };
  } catch {
    return defaultPersistedState();
  }
}

export function savePersistedState(state: PersistedAppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearPersistedState(): void {
  localStorage.removeItem(STORAGE_KEY);
}




