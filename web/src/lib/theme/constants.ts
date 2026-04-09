export const THEME_STORAGE_KEY = "doit:theme";

export const THEMES = ["dark", "light"] as const;

export type Theme = (typeof THEMES)[number];
