"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  updateBoardBackgroundColorAction,
  updateBoardBackgroundImageAction,
  type BoardBackgroundMutationResult
} from "./actions";

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600";

type BoardBackgroundButtonProps = {
  boardId: string;
  canManage: boolean;
  currentType: "color" | "image";
  currentColor: string | null;
  triggerClassName?: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "destructive";
  onTriggerClick?: () => void;
};

export function BoardBackgroundButton({
  boardId,
  canManage,
  currentType,
  currentColor,
  triggerClassName,
  triggerVariant = "secondary",
  onTriggerClick
}: BoardBackgroundButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [color, setColor] = React.useState(currentColor ?? "#18181B");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingMode, setPendingMode] = React.useState<"color" | "image" | null>(null);

  React.useEffect(() => {
    setColor(currentColor ?? "#18181B");
  }, [currentColor, open]);

  if (!canManage) {
    return null;
  }

  const handleSaveColor = async () => {
    if (pendingMode) return;
    setError(null);
    setPendingMode("color");
    const res: BoardBackgroundMutationResult = await updateBoardBackgroundColorAction(boardId, color);
    setPendingMode(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.refresh();
  };

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
          <p className="text-xs text-slate-400">
            Можно выбрать цвет или загрузить изображение.
          </p>

          <div className="space-y-2 rounded-lg border border-slate-800/90 bg-slate-900/40 p-3">
            <p className="text-xs font-medium text-slate-300">Цвет</p>
            <label className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={pendingMode !== null}
                className="h-9 w-14 cursor-pointer rounded border border-slate-600 bg-slate-900"
              />
              <span className="font-mono text-xs text-slate-500">{color.toUpperCase()}</span>
            </label>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant={currentType === "color" ? "secondary" : "primary"}
                disabled={pendingMode !== null}
                onClick={() => void handleSaveColor()}
              >
                {pendingMode === "color" ? "Сохранение…" : "Применить цвет"}
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-800/90 bg-slate-900/40 p-3">
            <p className="text-xs font-medium text-slate-300">Изображение</p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className={inputClass}
              disabled={pendingMode !== null}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant={currentType === "image" ? "secondary" : "primary"}
                disabled={pendingMode !== null}
                onClick={() => void handleUploadImage()}
              >
                {pendingMode === "image" ? "Загрузка…" : "Загрузить изображение"}
              </Button>
            </div>
          </div>

          {error ?
            <p className="text-sm text-rose-400" role="alert">
              {error}
            </p>
          : null}
        </div>
      </Modal>
    </>
  );
}
