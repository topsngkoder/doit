"use client";

import { BOARD_LAYOUT_TOKENS, resolveBoardViewportMode } from "./board-layout-geometry";

type BoardColumn = {
  id: string;
  name: string;
  columnType: string;
  position: number;
};

export type BoardColumnPagingState = {
  viewportWidth: number;
  columnsPerPage: number;
  totalPages: number;
  currentPage: number;
  currentPageStartIndex: number;
  visibleColumns: BoardColumn[];
};

function clampPage(page: number, totalPages: number) {
  if (totalPages <= 1) return 0;
  return Math.min(Math.max(page, 0), totalPages - 1);
}

export function computeBoardColumnPaging(
  columns: BoardColumn[],
  viewportWidth: number,
  requestedPage: number
): BoardColumnPagingState {
  const safeViewportWidth = Math.max(0, Math.floor(viewportWidth));
  const mode = resolveBoardViewportMode(safeViewportWidth);
  const totalColumns = columns.length;

  const columnsPerPage =
    mode === "mobile"
      ? 1
      : Math.max(
          1,
          Math.floor(
            (safeViewportWidth + BOARD_LAYOUT_TOKENS.columnGapDesktopTablet) /
              (BOARD_LAYOUT_TOKENS.columnWidthDesktopTablet + BOARD_LAYOUT_TOKENS.columnGapDesktopTablet)
          )
        );

  const totalPages = Math.max(1, Math.ceil(totalColumns / columnsPerPage));
  const currentPage = clampPage(requestedPage, totalPages);
  const currentPageStartIndex = currentPage * columnsPerPage;
  const visibleColumns = columns.slice(currentPageStartIndex, currentPageStartIndex + columnsPerPage);

  return {
    viewportWidth: safeViewportWidth,
    columnsPerPage,
    totalPages,
    currentPage,
    currentPageStartIndex,
    visibleColumns
  };
}
