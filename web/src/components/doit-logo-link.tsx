"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LAST_BOARD_STORAGE_KEY = "doit:last-opened-board-id";

export function DoitLogoLink() {
  const [href, setHref] = useState("/boards");

  useEffect(() => {
    try {
      const boardId = window.localStorage.getItem(LAST_BOARD_STORAGE_KEY);
      if (boardId) {
        setHref(`/boards/${boardId}`);
      }
    } catch {
      setHref("/boards");
    }
  }, []);

  return (
    <Link href={href} className="text-lg font-semibold tracking-tight">
      DOIT
    </Link>
  );
}
