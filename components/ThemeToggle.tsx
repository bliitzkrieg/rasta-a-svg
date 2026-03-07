"use client";

import type { ThemePreference } from "@/types/vector";
import { AppTooltip } from "./AppTooltip";

interface ThemeToggleProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

const ORDER: ThemePreference[] = ["light", "dark", "system"];

function nextTheme(current: ThemePreference): ThemePreference {
  const i = ORDER.indexOf(current);
  return ORDER[(i + 1) % ORDER.length];
}

function label(t: ThemePreference): string {
  if (t === "light") return "Light";
  if (t === "dark") return "Dark";
  return "System";
}

export function ThemeToggle({ theme, onThemeChange }: ThemeToggleProps) {
  return (
    <AppTooltip content={`Theme: ${label(theme)}. Switch to ${label(nextTheme(theme))}.`}>
      <button
        type="button"
        className="theme-toggle"
        onClick={() => onThemeChange(nextTheme(theme))}
        aria-label={`Theme: ${label(theme)}. Switch to ${label(nextTheme(theme))}.`}
      >
        <span className="theme-toggle-icon" aria-hidden>
          {theme === "light" ? "☀" : theme === "dark" ? "◇" : "◐"}
        </span>
        <span className="theme-toggle-label">{label(theme)}</span>
      </button>
    </AppTooltip>
  );
}
