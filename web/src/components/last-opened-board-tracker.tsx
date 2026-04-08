"use client";

import { useEffect } from "react";

const LAST_BOARD_STORAGE_KEY = "doit:last-opened-board-id";

type LastOpenedBoardTrackerProps = {
  boardId: string;
};

export function LastOpenedBoardTracker({ boardId }: LastOpenedBoardTrackerProps) {
  useEffect(() => {
    try {
      window.localStorage.setItem(LAST_BOARD_STORAGE_KEY, boardId);
    } catch {
      // Ignore localStorage write failures.
    }
  }, [boardId]);

  return null;
}
