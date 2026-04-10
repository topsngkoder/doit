export const BOARD_LAYOUT_BREAKPOINTS = {
  desktopMin: 1280,
  tabletMin: 768,
  tabletMax: 1279,
  mobileMax: 767
} as const;

export const BOARD_LAYOUT_TOKENS = {
  horizontalPaddingDesktopTablet: 16,
  horizontalPaddingMobile: 12,
  verticalPaddingDesktopTablet: 16,
  verticalPaddingMobile: 12,
  columnWidthDesktopTablet: 288,
  columnGapDesktopTablet: 16,
  columnGapMobile: 12,
  topRowHeightDesktopTablet: 56,
  topRowHeightMobile: 48,
  controlRowHeight: 40
} as const;

export type BoardViewportMode = "desktop" | "tablet" | "mobile";

export function resolveBoardViewportMode(viewportWidth: number): BoardViewportMode {
  if (viewportWidth >= BOARD_LAYOUT_BREAKPOINTS.desktopMin) return "desktop";
  if (viewportWidth >= BOARD_LAYOUT_BREAKPOINTS.tabletMin) return "tablet";
  return "mobile";
}

export function getBoardLayoutTokens(viewportWidth: number) {
  const mode = resolveBoardViewportMode(viewportWidth);
  const isMobile = mode === "mobile";

  return {
    mode,
    horizontalPadding: isMobile
      ? BOARD_LAYOUT_TOKENS.horizontalPaddingMobile
      : BOARD_LAYOUT_TOKENS.horizontalPaddingDesktopTablet,
    verticalPadding: isMobile
      ? BOARD_LAYOUT_TOKENS.verticalPaddingMobile
      : BOARD_LAYOUT_TOKENS.verticalPaddingDesktopTablet,
    columnWidth: isMobile ? null : BOARD_LAYOUT_TOKENS.columnWidthDesktopTablet,
    columnGap: isMobile
      ? BOARD_LAYOUT_TOKENS.columnGapMobile
      : BOARD_LAYOUT_TOKENS.columnGapDesktopTablet,
    topRowHeight: isMobile
      ? BOARD_LAYOUT_TOKENS.topRowHeightMobile
      : BOARD_LAYOUT_TOKENS.topRowHeightDesktopTablet,
    controlRowHeight: BOARD_LAYOUT_TOKENS.controlRowHeight
  } as const;
}
