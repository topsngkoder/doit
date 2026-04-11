"use client";

import * as React from "react";
import type { BoardYandexDiskIntegrationSnapshot } from "@/lib/board-snapshot-types";

const BoardYandexDiskIntegrationContext = React.createContext<
  BoardYandexDiskIntegrationSnapshot | undefined
>(undefined);

export function BoardYandexDiskIntegrationProvider({
  value,
  children
}: {
  value: BoardYandexDiskIntegrationSnapshot;
  children: React.ReactNode;
}) {
  return (
    <BoardYandexDiskIntegrationContext.Provider value={value}>
      {children}
    </BoardYandexDiskIntegrationContext.Provider>
  );
}

/** Снимок интеграции доски из `get_board_snapshot` (без токенов). */
export function useBoardYandexDiskIntegration(): BoardYandexDiskIntegrationSnapshot {
  const v = React.useContext(BoardYandexDiskIntegrationContext);
  if (v === undefined) {
    throw new Error(
      "useBoardYandexDiskIntegration: ожидается BoardYandexDiskIntegrationProvider на странице доски"
    );
  }
  return v;
}
