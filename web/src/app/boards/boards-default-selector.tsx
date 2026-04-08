"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Toast } from "@/components/ui/toast";
import { setDefaultBoardAction } from "./actions";
import type { BoardsPageBoardItem } from "./types";

type BoardsDefaultSelectorProps = {
  boards: BoardsPageBoardItem[];
  initialDefaultBoardId: string | null;
};

export function BoardsDefaultSelector({
  boards,
  initialDefaultBoardId
}: BoardsDefaultSelectorProps) {
  const router = useRouter();
  const [defaultBoardId, setDefaultBoardId] = useState<string | null>(initialDefaultBoardId);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onToggle(boardId: string, nextChecked: boolean) {
    if (isPending) {
      return;
    }

    const previousDefaultBoardId = defaultBoardId;
    const nextDefaultBoardId = nextChecked ? boardId : null;
    setErrorMessage(null);
    setDefaultBoardId(nextDefaultBoardId);

    startTransition(async () => {
      const result = await setDefaultBoardAction(nextDefaultBoardId);
      if (!result.ok) {
        setDefaultBoardId(previousDefaultBoardId);
        setErrorMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
        {boards.map((board) => (
          <li key={board.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <Link
              href={`/boards/${board.id}`}
              className="font-medium text-sky-400 hover:text-sky-300 hover:underline"
            >
              {board.name}
            </Link>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={defaultBoardId === board.id}
                onChange={(event) => onToggle(board.id, event.currentTarget.checked)}
                disabled={isPending}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
              />
              По умолчанию
            </label>
          </li>
        ))}
      </ul>
      {errorMessage ? <Toast title="Ошибка" message={errorMessage} variant="error" /> : null}
    </div>
  );
}
