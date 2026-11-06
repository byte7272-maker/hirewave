export type Theme = "light" | "dark";

const STORAGE_KEY = "hirewave_theme";

/** The user's saved choice, or null when they've never picked one. */
export function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

/** The theme to show on first paint: the saved choice, else the OS preference. */
export function resolveInitialTheme(): Theme {
  const stored = readStoredTheme();
  if (stored) return stored;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Apply a theme to the document root without persisting it. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/** Persist the user's explicit choice so it survives reloads. */
export function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage can be unavailable (private mode) — the class still applies */
  }
}

/**
 * Applied once before React renders so the very first paint already matches the
 * chosen theme (no flash of the wrong background).
 */
export function initTheme(): void {
  applyTheme(resolveInitialTheme());
}