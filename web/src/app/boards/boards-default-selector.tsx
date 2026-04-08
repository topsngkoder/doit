"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import {
  deleteBoardAction,
  renameBoardAction,
  setDefaultBoardAction
} from "./actions";
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
  const [visibleBoards, setVisibleBoards] = useState<BoardsPageBoardItem[]>(boards);
  const [defaultBoardId, setDefaultBoardId] = useState<string | null>(initialDefaultBoardId);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [renameBoard, setRenameBoard] = useState<BoardsPageBoardItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenamePending, setIsRenamePending] = useState(false);
  const [deleteBoard, setDeleteBoard] = useState<BoardsPageBoardItem | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletePending, setIsDeletePending] = useState(false);

  useEffect(() => {
    setVisibleBoards(boards);
  }, [boards]);

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

  function openRenameModal(board: BoardsPageBoardItem) {
    setRenameBoard(board);
    setRenameName(board.name);
    setRenameError(null);
  }

  function closeRenameModal() {
    if (isRenamePending) {
      return;
    }
    setRenameBoard(null);
    setRenameName("");
    setRenameError(null);
  }

  async function onRenameSubmit() {
    if (!renameBoard || isRenamePending) {
      return;
    }
    setRenameError(null);
    setIsRenamePending(true);
    const result = await renameBoardAction(renameBoard.id, renameName);
    setIsRenamePending(false);

    if (!result.ok) {
      setRenameError(result.error);
      return;
    }

    setVisibleBoards((prev) =>
      prev.map((board) =>
        board.id === renameBoard.id ? { ...board, name: renameName.trim() } : board
      )
    );
    closeRenameModal();
    router.refresh();
  }

  const isRenameSubmitDisabled = renameName.trim().length === 0 || isRenamePending;
  const expectedDeleteName = deleteBoard?.name.trim().toLocaleLowerCase() ?? "";
  const actualDeleteName = deleteConfirmationName.trim().toLocaleLowerCase();
  const isDeleteSubmitDisabled =
    isDeletePending || !expectedDeleteName || expectedDeleteName !== actualDeleteName;

  function openDeleteModal(board: BoardsPageBoardItem) {
    setDeleteBoard(board);
    setDeleteConfirmationName("");
    setDeleteError(null);
  }

  function closeDeleteModal() {
    if (isDeletePending) {
      return;
    }
    setDeleteBoard(null);
    setDeleteConfirmationName("");
    setDeleteError(null);
  }

  async function onDeleteSubmit() {
    if (!deleteBoard || isDeleteSubmitDisabled) {
      return;
    }
    setDeleteError(null);
    setIsDeletePending(true);
    const result = await deleteBoardAction(deleteBoard.id);
    setIsDeletePending(false);

    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }

    setVisibleBoards((prev) => prev.filter((board) => board.id !== deleteBoard.id));
    if (defaultBoardId === deleteBoard.id) {
      setDefaultBoardId(null);
    }
    closeDeleteModal();
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
        {visibleBoards.map((board) => (
          <li key={board.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <Link
                href={`/boards/${board.id}`}
                className="font-medium text-sky-400 hover:text-sky-300 hover:underline"
              >
                {board.name}
              </Link>
            </div>
            <div className="flex items-center gap-3">
              {board.can_rename ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => openRenameModal(board)}
                  disabled={isPending}
                >
                  Переименовать
                </Button>
              ) : null}
              {board.can_delete ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => openDeleteModal(board)}
                  disabled={isPending}
                >
                  Удалить
                </Button>
              ) : null}
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
            </div>
          </li>
        ))}
      </ul>
      {errorMessage ? <Toast title="Ошибка" message={errorMessage} variant="error" /> : null}
      <Modal open={!!renameBoard} title="Переименовать доску" onClose={closeRenameModal}>
        <div className="space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Название доски</span>
            <input
              type="text"
              maxLength={100}
              value={renameName}
              disabled={isRenamePending}
              onChange={(event) => setRenameName(event.currentTarget.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600"
            />
          </label>
          {renameError ? <Toast title="Ошибка" message={renameError} variant="error" /> : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isRenamePending}
              onClick={closeRenameModal}
            >
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isRenameSubmitDisabled}
              onClick={() => void onRenameSubmit()}
            >
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={!!deleteBoard} title="Удалить доску?" onClose={closeDeleteModal}>
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Доска будет удалена для всех участников. Данные восстановить нельзя.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">
              Введите название доски для подтверждения
            </span>
            <input
              type="text"
              value={deleteConfirmationName}
              disabled={isDeletePending}
              onChange={(event) => setDeleteConfirmationName(event.currentTarget.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600"
            />
          </label>
          {deleteError ? <Toast title="Ошибка" message={deleteError} variant="error" /> : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isDeletePending}
              onClick={closeDeleteModal}
            >
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isDeleteSubmitDisabled}
              onClick={() => void onDeleteSubmit()}
            >
              Удалить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
