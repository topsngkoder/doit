"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  removeBoardBackgroundImageAction,
  updateBoardBackgroundImageAction,
  type BoardBackgroundMutationResult
} from "./actions";

const inputClass = "field-base";

type BoardBackgroundButtonProps = {
  boardId: string;
  canManage: boolean;
  hasBackgroundImage: boolean;
  triggerClassName?: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "destructive";
  onTriggerClick?: () => void;
};

export function BoardBackgroundButton({
  boardId,
  canManage,
  hasBackgroundImage,
  triggerClassName,
  triggerVariant = "secondary",
  onTriggerClick
}: BoardBackgroundButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingMode, setPendingMode] = React.useState<"image" | "remove" | null>(null);

  if (!canManage) {
    return null;
  }

  const handleUploadImage = async () => {
    if (pendingMode) return;
    if (!file) {
      setError("Выберите файл изображения.");
      return;
    }
    setError(null);
    setPendingMode("image");
    const res: BoardBackgroundMutationResult = await updateBoardBackgroundImageAction(boardId, file);
    setPendingMode(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setFile(null);
    router.refresh();
  };

  const handleRemoveImage = async () => {
    if (pendingMode) return;
    setError(null);
    setPendingMode("remove");
    const res: BoardBackgroundMutationResult = await removeBoardBackgroundImageAction(boardId);
    setPendingMode(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
  };

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
        Фон
      </Button>
      <Modal open={open} title="Фон доски" onClose={() => setOpen(false)} className="max-w-md">
        <div className="space-y-4">
          <p className="text-xs text-app-secondary">
            Без изображения используется фон приложения (тёмная или светлая тема). Можно загрузить
            картинку на фон доски.
          </p>

          <div className="space-y-2 rounded-[var(--radius-surface)] border border-app-default bg-app-surface-muted p-3">
            <p className="text-xs font-medium text-app-primary">Изображение</p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className={inputClass}
              disabled={pendingMode !== null}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap justify-end gap-2">
              {hasBackgroundImage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pendingMode !== null}
                  onClick={() => void handleRemoveImage()}
                >
                  {pendingMode === "remove" ? "Удаление…" : "Убрать изображение"}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={pendingMode !== null}
                onClick={() => void handleUploadImage()}
              >
                {pendingMode === "image" ? "Загрузка…" : hasBackgroundImage ? "Заменить изображение" : "Загрузить изображение"}
              </Button>
            </div>
          </div>

          {error ?
            <p className="text-sm text-app-validation-error" role="alert">
              {error}
            </p>
          : null}
        </div>
      </Modal>
    </>
  );
}
