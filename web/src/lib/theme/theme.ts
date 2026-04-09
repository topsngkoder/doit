import { THEME_STORAGE_KEY, type Theme, THEMES } from "./constants";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function normalizeTheme(value: unknown): Theme {
  return isTheme(value) ? value : "dark";
}

export function readThemeFromStorage(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === null) return null;
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function readResolvedTheme(): Theme {
  return readThemeFromStorage() ?? "dark";
}

export function writeThemeToStorage(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* quota / private mode */
  }
}

export function applyThemeToDocument(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
