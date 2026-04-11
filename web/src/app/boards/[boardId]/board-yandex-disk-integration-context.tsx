"use client";

import * as React from "react";
import type { BoardYandexDiskIntegrationSnapshot } from "@/lib/board-snapshot-types";

type BoardYandexDiskIntegrationContextValue = {
  integration: BoardYandexDiskIntegrationSnapshot;
  canManageIntegration: boolean;
};

const BoardYandexDiskIntegrationContext = React.createContext<
  BoardYandexDiskIntegrationContextValue | undefined
>(undefined);

export function BoardYandexDiskIntegrationProvider({
  value,
  children
}: {
  value: BoardYandexDiskIntegrationContextValue;
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
  return v.integration;
}

/** Может ли текущий пользователь управлять интеграцией из карточки/создания карточки. */
export function useCanManageBoardYandexDiskIntegration(): boolean {
  const v = React.useContext(BoardYandexDiskIntegrationContext);
  if (v === undefined) {
    throw new Error(
      "useCanManageBoardYandexDiskIntegration: ожидается BoardYandexDiskIntegrationProvider на странице доски"
    );
  }
  return v.canManageIntegration;
}
