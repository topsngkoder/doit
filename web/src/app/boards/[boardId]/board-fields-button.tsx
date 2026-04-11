"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { NewCardFieldDefinition } from "./card-field-drafts";
import {
  BOARD_FIELD_TYPE_OPTIONS,
  type BoardCatalogFieldType
} from "./board-field-types";
import { cn } from "@/lib/utils";
import type { BoardYandexDiskIntegrationSnapshot } from "@/lib/board-snapshot-types";
import {
  getYandexDiskIntegrationModalPresentation,
  yandexDiskNonActiveIntegrationHint
} from "@/lib/yandex-disk/yandex-disk-integration-modal-presentation";
import { BoardYandexDiskIntegrationPanel } from "./board-yandex-disk-integration-panel";
import {
  createBoardFieldDefinitionAction,
  createBoardFieldSelectOptionAction,
  deleteBoardFieldDefinitionAction,
  deleteBoardFieldSelectOptionAction,
  moveBoardFieldDefinitionAction,
  moveBoardFieldSelectOptionAction,
  type BoardFieldCatalogResult,
  updateBoardFieldDefinitionAction,
  updateBoardFieldSelectOptionAction
} from "./actions";

const inputClass = "field-base";

function yandexDiskFieldCountLabel(n: number): string {
  if (n <= 0) {
    return "После создания полей типа «Яндекс диск» все они будут использовать интеграцию ниже.";
  }
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? "поле"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? "поля"
    : "полей";
  return `На доске ${n} ${word} типа «Яндекс диск» — все используют одну интеграцию ниже (без дублирования папки).`;
}

function selectOptionCountLabel(count: number): string {
  if (count === 0) return "Пока нет вариантов";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${count} вариантов`;
  if (mod10 === 1) return `${count} вариант`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} варианта`;
  return `${count} вариантов`;
}

type BoardFieldsButtonProps = {
  boardId: string;
  canManage: boolean;
  fieldDefinitions: NewCardFieldDefinition[];
  /** Статус интеграции в модалке «Поля доски» (YDB7.3). */
  yandexDiskIntegration: BoardYandexDiskIntegrationSnapshot;
  canViewYandexDiskIntegration: boolean;
  canManageYandexDiskIntegration: boolean;
  triggerClassName?: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "destructive";
  onTriggerClick?: () => void;
};

type FormState = {
  name: string;
  fieldType: BoardCatalogFieldType;
  isRequired: boolean;
};

export function BoardFieldsButton({
  boardId,
  canManage,
  fieldDefinitions,
  yandexDiskIntegration,
  canViewYandexDiskIntegration,
  canManageYandexDiskIntegration,
  triggerClassName,
  triggerVariant = "secondary",
  onTriggerClick
}: BoardFieldsButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [editingFieldId, setEditingFieldId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>({
    name: "",
    fieldType: "text",
    isRequired: false
  });
  const [optionDrafts, setOptionDrafts] = React.useState<Record<string, { name: string; color: string }>>(
    {}
  );
  const [optionEdits, setOptionEdits] = React.useState<Record<string, { name: string; color: string }>>(
    {}
  );
  const [yandexDiskSectionOpen, setYandexDiskSectionOpen] = React.useState(false);
  const [selectOptionsOpenByFieldId, setSelectOptionsOpenByFieldId] = React.useState<
    Record<string, boolean>
  >({});

  const yandexDiskUi = getYandexDiskIntegrationModalPresentation(yandexDiskIntegration, {
    forIntegrationManager: canManageYandexDiskIntegration
  });

  const sorted = React.useMemo(
    () => [...fieldDefinitions].sort((a, b) => a.position - b.position),
    [fieldDefinitions]
  );

  const yandexDiskFieldCount = React.useMemo(
    () => sorted.filter((f) => f.fieldType === "yandex_disk").length,
    [sorted]
  );

  const yandexDiskInactiveHint =
    yandexDiskIntegration?.status !== "active" ?
      yandexDiskNonActiveIntegrationHint({
        yandexDiskFieldCount,
        canManageIntegration: canManageYandexDiskIntegration
      })
    : null;

  const setDefaultForm = React.useCallback(() => {
    setEditingFieldId(null);
    setForm({ name: "", fieldType: "text", isRequired: false });
  }, []);

  const withPending = React.useCallback(
    async (job: () => Promise<BoardFieldCatalogResult>) => {
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

  const handleSubmitField = async (e: React.FormEvent) => {
    e.preventDefault();
    await withPending(async () => {
      if (editingFieldId) {
        const res = await updateBoardFieldDefinitionAction(boardId, editingFieldId, form);
        if (res.ok) setDefaultForm();
        return res;
      }
      const res = await createBoardFieldDefinitionAction(boardId, form);
      if (res.ok) setDefaultForm();
      return res;
    });
  };

  const startEdit = (field: NewCardFieldDefinition) => {
    setError(null);
    setEditingFieldId(field.id);
    setForm({
      name: field.name,
      fieldType: field.fieldType,
      isRequired: field.isRequired
    });
  };

  React.useEffect(() => {
    if (!open) {
      setError(null);
      setPending(false);
      setOptionDrafts({});
      setOptionEdits({});
      setDefaultForm();
      setYandexDiskSectionOpen(false);
      setSelectOptionsOpenByFieldId({});
    }
  }, [open, setDefaultForm]);

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
        Поля
      </Button>
      <Modal open={open} title="Поля доски" onClose={() => setOpen(false)} className="max-w-3xl">
        <div className="flex max-h-[min(80vh,700px)] flex-col gap-4 overflow-hidden">
          <p className="text-xs text-app-secondary">
            Управляйте пользовательскими полями карточек: тип, обязательность и порядок.
          </p>

          <form
            onSubmit={(e) => void handleSubmitField(e)}
            className="surface-muted shrink-0 rounded-lg border p-3"
          >
            <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-app-secondary">Название (1-50)</span>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  maxLength={50}
                  disabled={pending}
                  placeholder="Например: Приоритет"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-app-secondary">Тип</span>
                <select
                  className={inputClass}
                  value={form.fieldType}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      fieldType: e.target.value as FormState["fieldType"]
                    }))
                  }
                  disabled={pending}
                >
                  {BOARD_FIELD_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-6 flex items-center gap-2 text-sm text-app-primary">
                <input
                  type="checkbox"
                  className="checkbox-app h-4 w-4"
                  checked={form.isRequired}
                  onChange={(e) => setForm((s) => ({ ...s, isRequired: e.target.checked }))}
                  disabled={pending}
                />
                Обязательное
              </label>
              {form.fieldType === "yandex_disk" ?
                <p className="md:col-span-3 text-xs text-app-secondary">
                  Можно создать несколько полей «Яндекс диск» на одной доске: у каждого своё имя и порядок, а
                  папка на Диске и токены — общие для доски (раздел ниже).
                </p>
              : null}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              {editingFieldId ?
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setDefaultForm()}
                >
                  Отменить
                </Button>
              : null}
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Сохранение..." : editingFieldId ? "Сохранить" : "Создать поле"}
              </Button>
            </div>
          </form>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-2 text-xs font-medium text-app-primary">Текущие поля</p>
            {sorted.length === 0 ?
              <p className="text-xs text-app-tertiary">Пока нет полей. Создайте первое поле выше.</p>
            : <ul className="space-y-2">
                {sorted.map((field, index) => {
                  const optionDraft = optionDrafts[field.id] ?? {
                    name: "",
                    color: "#71717A"
                  };
                  const options = [...(field.selectOptions ?? [])].sort(
                    (a, b) => a.position - b.position
                  );
                  const selectOptionsOpen = selectOptionsOpenByFieldId[field.id] ?? false;
                  const selectToggleId = `board-field-select-${field.id}-toggle`;
                  const selectPanelId = `board-field-select-${field.id}-panel`;
                  return (
                    <li
                      key={field.id}
                      className="rounded-lg border border-app-default bg-app-surface p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-app-primary">
                            {field.name}
                          </p>
                          <p className="text-xs text-app-secondary">
                            {
                              BOARD_FIELD_TYPE_OPTIONS.find((o) => o.value === field.fieldType)
                                ?.label
                            }{" "}
                            · {field.isRequired ? "обязательное" : "необязательное"}
                          </p>
                          {field.fieldType === "yandex_disk" ?
                            <p className="mt-1 text-[11px] text-app-tertiary">
                              Файлы этого поля отделены от других полей «Яндекс диск»; хранилище доски одно.
                            </p>
                          : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={pending || index === 0}
                            onClick={() =>
                              void withPending(() =>
                                moveBoardFieldDefinitionAction(boardId, field.id, "up")
                              )
                            }
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={pending || index === sorted.length - 1}
                            onClick={() =>
                              void withPending(() =>
                                moveBoardFieldDefinitionAction(boardId, field.id, "down")
                              )
                            }
                          >
                            ↓
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => startEdit(field)}
                          >
                            Изменить
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="text-[color:var(--danger-subtle-text)] hover:bg-[color:var(--danger-subtle-bg)]"
                            disabled={pending}
                            onClick={() =>
                              void withPending(() =>
                                deleteBoardFieldDefinitionAction(boardId, field.id)
                              )
                            }
                          >
                            Удалить
                          </Button>
                        </div>
                      </div>

                      {field.fieldType === "select" ?
                        <div className="mt-3 shrink-0 border-t border-app-divider pt-2">
                          <button
                            type="button"
                            className="focus-ring-app flex w-full items-center gap-2 rounded-md border border-app-default bg-app-surface-muted px-3 py-2 text-left transition-colors hover:bg-app-surface-subtle"
                            aria-expanded={selectOptionsOpen}
                            aria-controls={selectPanelId}
                            id={selectToggleId}
                            disabled={pending}
                            onClick={() =>
                              setSelectOptionsOpenByFieldId((prev) => ({
                                ...prev,
                                [field.id]: !(prev[field.id] ?? false)
                              }))
                            }
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-app-primary">
                                Варианты списка
                              </span>
                              <span className="block truncate text-xs text-app-secondary">
                                {selectOptionCountLabel(options.length)}
                              </span>
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-[10px] leading-none text-app-tertiary transition-transform duration-200",
                                selectOptionsOpen && "rotate-180"
                              )}
                              aria-hidden
                            >
                              ▼
                            </span>
                          </button>
                          {selectOptionsOpen ?
                            <div
                              id={selectPanelId}
                              className="mt-2 max-h-[min(40vh,280px)] overflow-y-auto rounded-md border border-app-divider bg-app-surface-muted p-2"
                              role="region"
                              aria-labelledby={selectToggleId}
                            >
                          <div className="space-y-1.5">
                            {options.length === 0 ?
                              <p className="text-xs text-app-tertiary">
                                Пока нет вариантов. Добавьте первый ниже.
                              </p>
                            : options.map((opt, optIdx) => {
                                const edit = optionEdits[opt.id] ?? {
                                  name: opt.name,
                                  color: opt.color
                                };
                                return (
                                  <div
                                    key={opt.id}
                                    className="flex flex-wrap items-center gap-1 rounded border px-2 py-1"
                                    style={{
                                      borderColor: edit.color,
                                      backgroundColor: `color-mix(in srgb, ${edit.color} 16%, var(--bg-surface))`
                                    }}
                                  >
                                    <span
                                      className="h-3 w-3 rounded-full"
                                      style={{ backgroundColor: edit.color }}
                                      aria-hidden
                                    />
                                    <input
                                      className="field-base min-w-[140px] flex-1 px-2 py-1 text-xs"
                                      value={edit.name}
                                      maxLength={50}
                                      disabled={pending}
                                      onChange={(e) =>
                                        setOptionEdits((prev) => ({
                                          ...prev,
                                          [opt.id]: { ...edit, name: e.target.value }
                                        }))
                                      }
                                    />
                                    <input
                                      type="color"
                                      className="h-8 w-10 cursor-pointer rounded border border-app-default bg-app-surface"
                                      value={edit.color}
                                      disabled={pending}
                                      onChange={(e) =>
                                        setOptionEdits((prev) => ({
                                          ...prev,
                                          [opt.id]: { ...edit, color: e.target.value }
                                        }))
                                      }
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={pending}
                                      onClick={() =>
                                        void withPending(() =>
                                          updateBoardFieldSelectOptionAction(
                                            boardId,
                                            field.id,
                                            opt.id,
                                            { name: edit.name, color: edit.color }
                                          )
                                        )
                                      }
                                    >
                                      Сохранить
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={pending || optIdx === 0}
                                      onClick={() =>
                                        void withPending(() =>
                                          moveBoardFieldSelectOptionAction(
                                            boardId,
                                            field.id,
                                            opt.id,
                                            "up"
                                          )
                                        )
                                      }
                                    >
                                      ↑
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={pending || optIdx === options.length - 1}
                                      onClick={() =>
                                        void withPending(() =>
                                          moveBoardFieldSelectOptionAction(
                                            boardId,
                                            field.id,
                                            opt.id,
                                            "down"
                                          )
                                        )
                                      }
                                    >
                                      ↓
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      className="text-[color:var(--danger-subtle-text)] hover:bg-[color:var(--danger-subtle-bg)]"
                                      disabled={pending}
                                      onClick={() =>
                                        void withPending(() =>
                                          deleteBoardFieldSelectOptionAction(
                                            boardId,
                                            field.id,
                                            opt.id
                                          )
                                        )
                                      }
                                    >
                                      Удалить
                                    </Button>
                                  </div>
                                );
                              })}
                          </div>

                          <div className="mt-2 grid gap-2 md:grid-cols-[2fr_auto_auto]">
                            <input
                              className={inputClass}
                              placeholder="Новый вариант (1-50)"
                              maxLength={50}
                              value={optionDraft.name}
                              disabled={pending}
                              onChange={(e) =>
                                setOptionDrafts((prev) => ({
                                  ...prev,
                                  [field.id]: {
                                    ...optionDraft,
                                    name: e.target.value
                                  }
                                }))
                              }
                            />
                            <input
                              type="color"
                              className="h-9 w-14 cursor-pointer rounded border border-app-default bg-app-surface"
                              value={optionDraft.color}
                              disabled={pending}
                              onChange={(e) =>
                                setOptionDrafts((prev) => ({
                                  ...prev,
                                  [field.id]: {
                                    ...optionDraft,
                                    color: e.target.value
                                  }
                                }))
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                void withPending(async () => {
                                  const res = await createBoardFieldSelectOptionAction(
                                    boardId,
                                    field.id,
                                    {
                                      name: optionDraft.name,
                                      color: optionDraft.color
                                    }
                                  );
                                  if (res.ok) {
                                    setOptionDrafts((prev) => ({
                                      ...prev,
                                      [field.id]: { name: "", color: "#71717A" }
                                    }));
                                  }
                                  return res;
                                })
                              }
                            >
                              Добавить
                            </Button>
                          </div>
                            </div>
                          : null}
                        </div>
                      : null}
                    </li>
                  );
                })}
              </ul>}
          </div>

          {error ?
            <p className="shrink-0 text-sm text-app-validation-error" role="alert">
              {error}
            </p>
          : null}

          {canViewYandexDiskIntegration ?
            <div className="shrink-0 border-t border-app-divider pt-2">
              {yandexDiskInactiveHint ?
                <p
                  className="mb-2 rounded-md border border-[color:var(--warning-subtle-border)] bg-[color:var(--warning-subtle-bg)] px-2 py-1.5 text-xs text-app-primary"
                  role="status"
                >
                  {yandexDiskInactiveHint}
                </p>
              : null}
              <button
                type="button"
                className="focus-ring-app flex w-full items-center gap-2 rounded-md border border-app-default bg-app-surface-muted px-3 py-2 text-left transition-colors hover:bg-app-surface-subtle"
                aria-expanded={yandexDiskSectionOpen}
                aria-controls="board-fields-yandex-disk-panel"
                id="board-fields-yandex-disk-toggle"
                onClick={() => setYandexDiskSectionOpen((v) => !v)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-app-primary">Яндекс.Диск</span>
                  <span className="block truncate text-xs text-app-secondary">{yandexDiskUi.title}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[10px] leading-none text-app-tertiary transition-transform duration-200",
                    yandexDiskSectionOpen && "rotate-180"
                  )}
                  aria-hidden
                >
                  ▼
                </span>
              </button>
              {yandexDiskSectionOpen ?
                <div
                  id="board-fields-yandex-disk-panel"
                  className="mt-2 max-h-[min(45vh,320px)] overflow-y-auto"
                  role="region"
                  aria-labelledby="board-fields-yandex-disk-toggle"
                >
                  <p className="mb-2 text-xs text-app-secondary">{yandexDiskFieldCountLabel(yandexDiskFieldCount)}</p>
                  <BoardYandexDiskIntegrationPanel
                    boardId={boardId}
                    integration={yandexDiskIntegration}
                    canManageIntegration={canManageYandexDiskIntegration}
                    showIntroHeading={false}
                  />
                </div>
              : null}
            </div>
          : null}
        </div>
      </Modal>
    </>
  );
}
