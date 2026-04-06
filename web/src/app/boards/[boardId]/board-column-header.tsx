"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  deleteBoardColumnAction,
  moveBoardColumnAction,
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
  const [state, formAction] = useFormState(bound, initialState);

  React.useEffect(() => {
    if (state.ok) {
      onSuccess();
    }
  }, [state.ok, onSuccess]);

  return (
    <form action={formAction} className="space-y-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-400">Название</span>
        <input
          name="name"
          type="text"
          required
          maxLength={50}
          defaultValue={initialName}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-400">Тип колонки</span>
        <select
          name="column_type"
          required
          defaultValue={initialType}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600"
        >
          {COLUMN_TYPES.map((t) => (
            <option key={t} value={t}>
              {columnTypeLabel(t)}
            </option>
          ))}
        </select>
      </label>
      {state.ok === false && state.message ? (
        <p className="text-sm text-rose-400">{state.message}</p>
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
  columnIndex,
  columnCount,
  canRename,
  canReorder,
  canDelete,
  columnDrag = null
}: BoardColumnHeaderProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [asyncError, setAsyncError] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
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

  const handleMove = async (direction: "left" | "right") => {
    setAsyncError(null);
    const res = await moveBoardColumnAction(boardId, columnId, direction);
    if (!res.ok) {
      setAsyncError(res.message);
    }
  };

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

  const showReorder = canReorder;
  const showMenu = canRename || canDelete;
  const editFormKey = `${columnId}-${name}-${columnType}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5">
          {columnDrag ?
            <button
              type="button"
              ref={columnDrag.setActivatorNodeRef}
              className="mt-0.5 shrink-0 cursor-grab touch-none rounded border border-transparent px-0.5 text-slate-500 hover:text-slate-300 active:cursor-grabbing"
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
          <h2 className="truncate text-sm font-medium text-slate-100">{name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              {columnTypeLabel(columnType)}
            </span>
            <span className="text-[10px] text-slate-600">·</span>
            <span className="text-[10px] text-slate-500">{cardCount} карточек</span>
          </div>
          </div>
        </div>
        {showReorder || showMenu ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {showReorder ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100"
                  disabled={columnIndex <= 0}
                  title="Влево"
                  aria-label="Переместить колонку влево"
                  onClick={() => handleMove("left")}
                >
                  ‹
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100"
                  disabled={columnIndex >= columnCount - 1}
                  title="Вправо"
                  aria-label="Переместить колонку вправо"
                  onClick={() => handleMove("right")}
                >
                  ›
                </Button>
              </>
            ) : null}
            {showMenu ? (
              <div className="relative" ref={menuRef}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-slate-400 hover:text-slate-100"
                  aria-expanded={menuOpen}
                  aria-haspopup="true"
                  title="Действия с колонкой"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  ⋮
                </Button>
                {menuOpen ? (
                  <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-md border border-slate-800 bg-slate-950 py-1 text-xs shadow-lg">
                    {canRename ? (
                      <button
                        type="button"
                        className="flex w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800/90"
                        onClick={() => {
                          closeMenu();
                          setAsyncError(null);
                          setEditOpen(true);
                        }}
                      >
                        Изменить название и тип…
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="flex w-full px-3 py-2 text-left text-rose-300 hover:bg-slate-800/90"
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
      {asyncError ? <p className="text-xs text-rose-400">{asyncError}</p> : null}

      <Modal open={editOpen} title="Колонка" onClose={() => setEditOpen(false)}>
        <EditColumnForm
          key={editFormKey}
          boardId={boardId}
          columnId={columnId}
          initialName={name}
          initialType={columnType}
          onSuccess={() => setEditOpen(false)}
        />
        <div className="mt-3 flex justify-end border-t border-slate-800 pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditOpen(false)}>
            Отмена
          </Button>
        </div>
      </Modal>

      <Modal open={deleteOpen} title="Удалить колонку?" onClose={() => setDeleteOpen(false)}>
        <p className="text-sm text-slate-300">
          Колонка «{name}» будет удалена. Удаление возможно только если в ней нет карточек.
        </p>
        {asyncError ? <p className="mt-2 text-sm text-rose-400">{asyncError}</p> : null}
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
