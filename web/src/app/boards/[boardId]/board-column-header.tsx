"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  deleteBoardColumnAction,
  updateBoardColumnAction,
  type ColumnMutationResult
} from "./actions";
import { COLUMN_TYPES, columnTypeLabel } from "./column-types";

type BoardColumnHeaderProps = {
  boardId: string;
  columnId: string;
  name: string;
  columnType: string;
  cardCount: number;
  columnIndex: number;
  columnCount: number;
  canRename: boolean;
  canReorder: boolean;
  canDelete: boolean;
  canMoveToPrevPage?: boolean;
  canMoveToNextPage?: boolean;
  onMoveToPrevPage?: (() => Promise<void>) | null;
  onMoveToNextPage?: (() => Promise<void>) | null;
  /** Ручка перетаскивания колонки (@dnd-kit); только при `canReorder`. */
  columnDrag?: {
    setActivatorNodeRef: (element: HTMLElement | null) => void;
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
  } | null;
};

const initialState: ColumnMutationResult = { ok: false, message: "" };

function EditSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Сохранение…" : "Сохранить"}
    </Button>
  );
}

function EditColumnForm({
  boardId,
  columnId,
  initialName,
  initialType,
  onSuccess
}: {
  boardId: string;
  columnId: string;
  initialName: string;
  initialType: string;
  onSuccess: () => void;
}) {
  const bound = updateBoardColumnAction.bind(null, boardId, columnId);
  const [state, formAction] = React.useActionState(bound, initialState);

  React.useEffect(() => {
    if (state.ok) {
      onSuccess();
    }
  }, [state.ok, onSuccess]);

  return (
    <form action={formAction} className="space-y-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-app-tertiary">Название</span>
        <input
          name="name"
          type="text"
          required
          maxLength={50}
          defaultValue={initialName}
          className="field-base"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-app-tertiary">Тип колонки</span>
        <select
          name="column_type"
          required
          defaultValue={initialType}
          className="field-base"
        >
          {COLUMN_TYPES.map((t) => (
            <option key={t} value={t}>
              {columnTypeLabel(t)}
            </option>
          ))}
        </select>
      </label>
      {state.ok === false && state.message ? (
        <p className="text-sm text-app-validation-error">{state.message}</p>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <EditSubmitButton />
      </div>
    </form>
  );
}

export function BoardColumnHeader({
  boardId,
  columnId,
  name,
  columnType,
  cardCount,
  canRename,
  canReorder,
  canDelete,
  canMoveToPrevPage = false,
  canMoveToNextPage = false,
  onMoveToPrevPage = null,
  onMoveToNextPage = null,
  columnDrag = null
}: BoardColumnHeaderProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [asyncError, setAsyncError] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [moveBusyDirection, setMoveBusyDirection] = React.useState<"prev" | "next" | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const closeMenu = React.useCallback(() => setMenuOpen(false), []);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const handleDelete = async () => {
    setAsyncError(null);
    setDeleteBusy(true);
    try {
      const res = await deleteBoardColumnAction(boardId, columnId);
      if (!res.ok) {
        setAsyncError(res.message);
        return;
      }
      setDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleMove = async (direction: "prev" | "next") => {
    const handler = direction === "prev" ? onMoveToPrevPage : onMoveToNextPage;
    if (!handler) return;
    const canMove = direction === "prev" ? canMoveToPrevPage : canMoveToNextPage;
    if (!canMove) return;
    setAsyncError(null);
    setMoveBusyDirection(direction);
    try {
      await handler();
      closeMenu();
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : "Не удалось переместить колонку.";
      setAsyncError(message);
    } finally {
      setMoveBusyDirection(null);
    }
  };

  const hasPageMoveActions = canReorder && (onMoveToPrevPage != null || onMoveToNextPage != null);
  const showMenu = canRename || canDelete || hasPageMoveActions;
  const editFormKey = `${columnId}-${name}-${columnType}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5">
          {columnDrag ?
            <button
              type="button"
              ref={columnDrag.setActivatorNodeRef}
              className="mt-0.5 shrink-0 cursor-grab touch-none rounded border border-transparent px-0.5 text-app-tertiary hover:text-app-secondary active:cursor-grabbing"
              title="Перетащить колонку"
              aria-label="Перетащить колонку"
              {...columnDrag.attributes}
              {...columnDrag.listeners}
            >
              <span className="text-xs leading-none tracking-tighter" aria-hidden>
                ⋮⋮
              </span>
            </button>
          : null}
          <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-medium text-app-primary">{name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-app-tertiary">
              {columnTypeLabel(columnType)}
            </span>
            <span className="text-[10px] text-app-tertiary">·</span>
            <span className="text-[10px] text-app-tertiary">{cardCount} карточек</span>
          </div>
          </div>
        </div>
        {showMenu ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {showMenu ? (
              <div className="relative" ref={menuRef}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-app-tertiary hover:text-app-primary"
                  aria-expanded={menuOpen}
                  aria-haspopup="true"
                  title="Действия с колонкой"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  ⋮
                </Button>
                {menuOpen ? (
                  <div className="popup-panel absolute right-0 z-20 mt-1 min-w-[180px] py-1 text-xs shadow-[var(--shadow-card)]">
                    {canRename ? (
                      <button
                        type="button"
                        className="flex w-full px-3 py-2 text-left text-app-secondary hover:bg-app-surface-muted hover:text-app-primary"
                        onClick={() => {
                          closeMenu();
                          setAsyncError(null);
                          setEditOpen(true);
                        }}
                      >
                        Изменить название и тип…
                      </button>
                    ) : null}
                    {hasPageMoveActions ? (
                      <>
                        <button
                          type="button"
                          className="flex w-full px-3 py-2 text-left text-app-secondary hover:bg-app-surface-muted hover:text-app-primary disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void handleMove("prev")}
                          disabled={!canMoveToPrevPage || moveBusyDirection != null}
                        >
                          {moveBusyDirection === "prev" ? "Перенос…" : "На предыдущий экран"}
                        </button>
                        <button
                          type="button"
                          className="flex w-full px-3 py-2 text-left text-app-secondary hover:bg-app-surface-muted hover:text-app-primary disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void handleMove("next")}
                          disabled={!canMoveToNextPage || moveBusyDirection != null}
                        >
                          {moveBusyDirection === "next" ? "Перенос…" : "На следующий экран"}
                        </button>
                      </>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="flex w-full px-3 py-2 text-left hover:bg-app-surface-muted"
                        style={{ color: "var(--danger-subtle-text)" }}
                        onClick={() => {
                          closeMenu();
                          setAsyncError(null);
                          setDeleteOpen(true);
                        }}
                      >
                        Удалить колонку…
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {asyncError ? <p className="text-xs text-app-validation-error">{asyncError}</p> : null}

      <Modal open={editOpen} title="Колонка" onClose={() => setEditOpen(false)}>
        <EditColumnForm
          key={editFormKey}
          boardId={boardId}
          columnId={columnId}
          initialName={name}
          initialType={columnType}
          onSuccess={() => setEditOpen(false)}
        />
        <div className="mt-3 flex justify-end border-t border-app-divider pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditOpen(false)}>
            Отмена
          </Button>
        </div>
      </Modal>

      <Modal open={deleteOpen} title="Удалить колонку?" onClose={() => setDeleteOpen(false)}>
        <p className="text-sm text-app-secondary">
          Колонка «{name}» будет удалена. Удаление возможно только если в ней нет карточек.
        </p>
        {asyncError ? <p className="mt-2 text-sm text-app-validation-error">{asyncError}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteOpen(false)}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={deleteBusy}
            onClick={handleDelete}
          >
            {deleteBusy ? "Удаление…" : "Удалить"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
