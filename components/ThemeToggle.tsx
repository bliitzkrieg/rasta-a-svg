"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "@/types/vector";
import { AppTooltip } from "./AppTooltip";

interface ThemeToggleProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  className?: string;
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

export function ThemeToggle({ theme, onThemeChange, className }: ThemeToggleProps) {
  const text = `Theme: ${label(theme)}. Switch to ${label(nextTheme(theme))}.`;
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <AppTooltip content={text}>
      <button
        type="button"
        className={className ?? "theme-toggle"}
        onClick={() => onThemeChange(nextTheme(theme))}
        aria-label={text}
      >
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
      </button>
    </AppTooltip>
  );
}
