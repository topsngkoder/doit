"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { NewCardFieldDefinition } from "./card-field-drafts";
import type { BoardCardPreviewItem } from "./column-types";
import {
  createBoardCardPreviewCustomFieldItemAction,
  deleteBoardCardPreviewItemAction,
  moveBoardCardPreviewItemAction,
  toggleBoardCardPreviewItemAction,
  type BoardCardPreviewResult
} from "./actions";

type BoardCardPreviewButtonProps = {
  boardId: string;
  canManage: boolean;
  previewItems: BoardCardPreviewItem[];
  fieldDefinitions: NewCardFieldDefinition[];
  triggerClassName?: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "destructive";
  onTriggerClick?: () => void;
};

function previewLabel(itemType: BoardCardPreviewItem["itemType"]): string {
  switch (itemType) {
    case "title":
      return "Название";
    case "assignees":
      return "Участники";
    case "comments_count":
      return "Количество комментариев";
    case "labels":
      return "Метки";
    case "responsible":
      return "Ответственный";
    case "custom_field":
      return "Пользовательское поле";
    default:
      return itemType;
  }
}

export function BoardCardPreviewButton({
  boardId,
  canManage,
  previewItems,
  fieldDefinitions,
  triggerClassName,
  triggerVariant = "secondary",
  onTriggerClick
}: BoardCardPreviewButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newFieldId, setNewFieldId] = React.useState("");

  const items = React.useMemo(
    () => [...previewItems].sort((a, b) => a.position - b.position),
    [previewItems]
  );

  const customFieldIdsInPreview = React.useMemo(
    () =>
      new Set(
        items
          .filter((i) => i.itemType === "custom_field" && i.fieldDefinitionId)
          .map((i) => i.fieldDefinitionId as string)
      ),
    [items]
  );

  const availableCustomFields = React.useMemo(
    () => fieldDefinitions.filter((f) => !customFieldIdsInPreview.has(f.id)),
    [customFieldIdsInPreview, fieldDefinitions]
  );

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setPending(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!newFieldId && availableCustomFields.length > 0) {
      setNewFieldId(availableCustomFields[0].id);
    }
    if (availableCustomFields.length === 0) {
      setNewFieldId("");
    }
  }, [availableCustomFields, newFieldId]);

  const withPending = React.useCallback(
    async (job: () => Promise<BoardCardPreviewResult>) => {
      if (pending) return;
      setPending(true);
      setError(null);
      const res = await job();
      setPending(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
    },
    [pending, router]
  );

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
        Отображение карточек
      </Button>
      <Modal
        open={open}
        title="Отображение карточек"
        onClose={() => setOpen(false)}
        className="max-w-3xl"
      >
        <div className="flex max-h-[min(80vh,700px)] flex-col gap-4 overflow-hidden">
          <p className="text-sm text-slate-400">
            Выберите, какие элементы показывать в карточках, и их порядок. Поле
            «Название» всегда включено и должно быть первым.
          </p>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul className="space-y-2">
              {items.map((item, idx) => {
                const fieldName =
                  item.itemType === "custom_field" && item.fieldDefinitionId ?
                    fieldDefinitions.find((f) => f.id === item.fieldDefinitionId)?.name ?? "Поле"
                  : null;
                const isTitle = item.itemType === "title";
                const canDelete = item.itemType === "custom_field";
                return (
                  <li key={item.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-slate-100">
                          {previewLabel(item.itemType)}
                          {fieldName ? `: ${fieldName}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <label className="mr-1 flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-sky-500"
                            checked={item.enabled}
                            disabled={pending || isTitle}
                            onChange={(e) =>
                              void withPending(() =>
                                toggleBoardCardPreviewItemAction(boardId, item.id, e.target.checked)
                              )
                            }
                          />
                          Включено
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending || idx === 0}
                          onClick={() =>
                            void withPending(() =>
                              moveBoardCardPreviewItemAction(boardId, item.id, "up")
                            )
                          }
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending || idx === items.length - 1}
                          onClick={() =>
                            void withPending(() =>
                              moveBoardCardPreviewItemAction(boardId, item.id, "down")
                            )
                          }
                        >
                          ↓
                        </Button>
                        {canDelete ?
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="text-rose-200 hover:bg-rose-950/40"
                            disabled={pending}
                            onClick={() =>
                              void withPending(() =>
                                deleteBoardCardPreviewItemAction(boardId, item.id)
                              )
                            }
                          >
                            Удалить
                          </Button>
                        : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="shrink-0 rounded-lg border border-slate-800/90 bg-slate-900/40 p-3">
            <p className="mb-2 text-sm font-medium text-slate-300">
              Добавить пользовательское поле в превью
            </p>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <select
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600"
                value={newFieldId}
                onChange={(e) => setNewFieldId(e.target.value)}
                disabled={pending || availableCustomFields.length === 0}
              >
                {availableCustomFields.length === 0 ?
                  <option value="">Все поля уже добавлены</option>
                : availableCustomFields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name}
                    </option>
                  ))}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={pending || !newFieldId}
                onClick={() =>
                  void withPending(() =>
                    createBoardCardPreviewCustomFieldItemAction(boardId, newFieldId)
                  )
                }
              >
                Добавить
              </Button>
            </div>
          </div>

          {error ?
            <p className="shrink-0 text-sm text-rose-400" role="alert">
              {error}
            </p>
          : null}
        </div>
      </Modal>
    </>
  );
}
