import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  readStoredTheme,
  resolveInitialTheme,
  writeStoredTheme,
  type Theme,
} from "@/lib/theme";

/**
 * Module-level subscribers so every theme toggle rendered on the page (topbar,
 * marketing nav, auth panel) stays in sync from a single source of truth.
 */
const listeners = new Set<(theme: Theme) => void>();

/** Read the theme currently applied to the document root. */
function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Apply + persist a theme, then notify every subscribed toggle. */
function commitTheme(next: Theme): void {
  applyTheme(next);
  writeStoredTheme(next);
  listeners.forEach((listener) => listener(next));
}

/**
 * Shared theme state. Returns the active theme plus a `toggle` (and an explicit
 * `setTheme`) that flip the whole app instantly and remember the choice.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : resolveInitialTheme()
  );

  useEffect(() => {
    const listener = (next: Theme) => setThemeState(next);
    listeners.add(listener);
    // Re-sync in case another toggle changed the theme before this one mounted.
    setThemeState(currentTheme());

    // Follow the OS setting only while the user hasn't made an explicit choice.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (readStoredTheme()) return;
      const next: Theme = event.matches ? "dark" : "light";
      applyTheme(next);
      listeners.forEach((listener2) => listener2(next));
    };
    media.addEventListener?.("change", onSystemChange);

    return () => {
      listeners.delete(listener);
      media.removeEventListener?.("change", onSystemChange);
    };
  }, []);

  const toggle = useCallback(() => {
    commitTheme(currentTheme() === "dark" ? "light" : "dark");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    commitTheme(next);
  }, []);

  return { theme, toggle, setTheme };
}