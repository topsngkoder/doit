"use client";

import * as React from "react";
import type { Theme } from "./constants";
import {
  applyThemeToDocument,
  readResolvedTheme,
  writeThemeToStorage
} from "./theme";

export type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("dark");

  React.useLayoutEffect(() => {
    const resolved = readResolvedTheme();
    setThemeState(resolved);
    applyThemeToDocument(resolved);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    writeThemeToStorage(next);
    applyThemeToDocument(next);
    setThemeState(next);
  }, []);

  const value = React.useMemo(
    (): ThemeContextValue => ({ theme, setTheme }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
