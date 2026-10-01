"use client";

import { useEffect, useState } from "react";
import {
  readThemePreference,
  resolveTheme,
  writeThemePreference,
} from "@/lib/theme";
import type { ThemePreference } from "@/types/vector";

/**
 * Theme preference shared by every page. The <head> bootstrap script applies
 * the saved theme before paint; this hook keeps it in sync afterwards and
 * follows the OS setting while the preference is "system".
 */
export function useThemePreference(): [
  ThemePreference,
  (theme: ThemePreference) => void,
] {
  const [theme, setThemeState] = useState<ThemePreference>("system");

  useEffect(() => {
    setThemeState(readThemePreference());
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolveTheme(theme));
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () =>
      document.documentElement.setAttribute("data-theme", resolveTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (next: ThemePreference) => {
    writeThemePreference(next);
    setThemeState(next);
  };

  return [theme, setTheme];
}
