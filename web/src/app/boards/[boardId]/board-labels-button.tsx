"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { BoardLabelOption } from "./column-types";
import {
  createBoardLabelAction,
  deleteBoardLabelAction,
  moveBoardLabelAction,
  updateBoardLabelAction,
  type BoardLabelCatalogResult
} from "./actions";

const inputClass = "field-base";

type BoardLabelsButtonProps = {
  boardId: string;
  canManage: boolean;
  labels: BoardLabelOption[];
  triggerClassName?: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "destructive";
  onTriggerClick?: () => void;
};

export function BoardLabelsButton({
  boardId,
  canManage,
  labels,
  triggerClassName,
  triggerVariant = "secondary",
  onTriggerClick
}: BoardLabelsButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#71717A");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [editPendingId, setEditPendingId] = React.useState<string | null>(null);
  const [movePendingId, setMovePendingId] = React.useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [editingColor, setEditingColor] = React.useState("#71717A");

  const sorted = React.useMemo(
    () => [...labels].sort((a, b) => a.position - b.position),
    [labels]
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const res: BoardLabelCatalogResult = await createBoardLabelAction(boardId, name, color);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setName("");
    router.refresh();
  };

  const handleDelete = async (labelId: string) => {
    if (deletePendingId || pending || editPendingId || movePendingId) return;
    setError(null);
    setDeletePendingId(labelId);
    const res = await deleteBoardLabelAction(boardId, labelId);
    setDeletePendingId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
  };

  const handleMove = async (labelId: string, direction: "up" | "down") => {
    if (deletePendingId || pending || editPendingId || movePendingId) return;
    setError(null);
    setMovePendingId(labelId);
    const res = await moveBoardLabelAction(boardId, labelId, direction);
    setMovePendingId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
  };

  const startEdit = (label: BoardLabelOption) => {
    setError(null);
    setEditingId(label.id);
    setEditingName(label.name);
    setEditingColor(label.color);
  };

  const handleEditSave = async () => {
    if (!editingId || deletePendingId || pending || editPendingId || movePendingId) return;
    setError(null);
    setEditPendingId(editingId);
    const res = await updateBoardLabelAction(boardId, editingId, {
      name: editingName,
      color: editingColor
    });
    setEditPendingId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setEditingId(null);
    router.refresh();
  };

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setName("");
      setEditingId(null);
    }
  }, [open]);

  if (!canManage) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size="sm"
        className={triggerClassName}
        onClick={() => {
          onTriggerClick?.();
          setOpen(true);
        }}
      >
        Метки
      </Button>
      <Modal open={open} title="Метки доски" onClose={() => setOpen(false)} className="max-w-md">
        <div className="flex max-h-[min(70vh,520px)] flex-col gap-4 overflow-hidden">
          <p className="text-xs text-app-secondary">
            Метки общие для доски. После создания их можно назначать на карточки в модальном окне карточки.
          </p>
          <form onSubmit={handleCreate} className="surface-muted shrink-0 space-y-2 rounded-lg border p-3">
            <p className="text-xs font-medium text-app-primary">Новая метка</p>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-app-secondary">Название (1–30 символов)</span>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                placeholder="Например: баг"
                disabled={pending}
                autoComplete="off"
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="text-xs text-app-secondary">Цвет</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={pending}
                className="h-9 w-14 cursor-pointer rounded border border-app-default bg-app-surface"
              />
              <span className="font-mono text-xs text-app-tertiary">{color.toUpperCase()}</span>
            </label>
            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Создание…" : "Создать"}
              </Button>
            </div>
          </form>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-2 text-xs font-medium text-app-primary">Текущие метки</p>
            {sorted.length === 0 ?
              <p className="text-xs text-app-tertiary">Пока ни одной — добавьте выше.</p>
            : <ul className="space-y-1.5">
                {sorted.map((l, idx) => (
                  <li
                    key={l.id}
                    className="rounded-md border border-app-default bg-app-surface px-2 py-1.5"
                  >
                    {editingId === l.id ?
                      <div className="space-y-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-app-secondary">Название</span>
                          <input
                            className={inputClass}
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            maxLength={30}
                            disabled={editPendingId !== null}
                          />
                        </label>
                        <label className="flex items-center gap-3">
                          <span className="text-xs text-app-secondary">Цвет</span>
                          <input
                            type="color"
                            value={editingColor}
                            onChange={(e) => setEditingColor(e.target.value)}
                            disabled={editPendingId !== null}
                            className="h-8 w-12 cursor-pointer rounded border border-app-default bg-app-surface"
                          />
                          <span className="font-mono text-xs text-app-tertiary">{editingColor.toUpperCase()}</span>
                        </label>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingId(null)}
                            disabled={editPendingId !== null}
                          >
                            Отмена
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleEditSave()}
                            disabled={editPendingId !== null}
                          >
                            {editPendingId === l.id ? "Сохранение…" : "Сохранить"}
                          </Button>
                        </div>
                      </div>
                    : <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: l.color }}
                            aria-hidden
                          />
                          <span className="truncate text-sm text-app-primary">{l.name}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={movePendingId !== null || pending || idx === 0}
                            onClick={() => void handleMove(l.id, "up")}
                            title="Переместить выше"
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={movePendingId !== null || pending || idx === sorted.length - 1}
                            onClick={() => void handleMove(l.id, "down")}
                            title="Переместить ниже"
                          >
                            ↓
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => startEdit(l)}
                            disabled={deletePendingId !== null || pending || movePendingId !== null}
                          >
                            Изменить
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="text-[color:var(--danger-subtle-text)] hover:bg-[color:var(--danger-subtle-bg)]"
                            disabled={deletePendingId !== null || pending || movePendingId !== null}
                            onClick={() => void handleDelete(l.id)}
                          >
                            {deletePendingId === l.id ? "…" : "Удалить"}
                          </Button>
                        </div>
                      </div>}
                  </li>
                ))}
              </ul>}
          </div>

          {error ?
            <p className="shrink-0 text-sm text-app-validation-error" role="alert">
              {error}
            </p>
          : null}
        </div>
      </Modal>
    </>
  );
}
