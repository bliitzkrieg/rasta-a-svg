import type { ThemePreference } from "@/types/vector";

/** localStorage key for the theme preference (shared by every page). */
export const THEME_STORAGE_KEY = "png2svg-theme";

/** Older builds stored the theme inside the converter preferences blob. */
const LEGACY_PREFS_KEY = "r2v-lab-state-v37";

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
    const legacy = localStorage.getItem(LEGACY_PREFS_KEY);
    if (legacy) {
      const theme = (JSON.parse(legacy) as { theme?: unknown }).theme;
      if (theme === "light" || theme === "dark" || theme === "system") {
        return theme;
      }
    }
  } catch {
    // Storage unavailable (private mode, blocked cookies): fall through.
  }
  return "system";
}

export function writeThemePreference(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore: the choice still applies for this page view.
  }
}

export function resolveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Inline script for <head>: applies the saved theme before first paint so
 * pages never flash the wrong theme. Kept dependency-free and tiny.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"&&t!=="system"){var l=localStorage.getItem("${LEGACY_PREFS_KEY}");t=l?JSON.parse(l).theme:"system";}if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
