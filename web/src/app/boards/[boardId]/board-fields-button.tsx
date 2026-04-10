"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { NewCardFieldDefinition } from "./card-field-drafts";
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

type BoardFieldsButtonProps = {
  boardId: string;
  canManage: boolean;
  fieldDefinitions: NewCardFieldDefinition[];
  triggerClassName?: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "destructive";
  onTriggerClick?: () => void;
};

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Текст" },
  { value: "date", label: "Дата" },
  { value: "select", label: "Список" },
  { value: "link", label: "Ссылка" }
] as const;

type FormState = {
  name: string;
  fieldType: "text" | "date" | "select" | "link";
  isRequired: boolean;
};

export function BoardFieldsButton({
  boardId,
  canManage,
  fieldDefinitions,
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

  const sorted = React.useMemo(
    () => [...fieldDefinitions].sort((a, b) => a.position - b.position),
    [fieldDefinitions]
  );

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
          <p className="text-xs text-slate-400">
            Управляйте пользовательскими полями карточек: тип, обязательность и порядок.
          </p>

          <form
            onSubmit={(e) => void handleSubmitField(e)}
            className="shrink-0 rounded-lg border border-slate-800/90 bg-slate-900/40 p-3"
          >
            <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Название (1-50)</span>
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
                <span className="text-xs text-slate-400">Тип</span>
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
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-6 flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-sky-500"
                  checked={form.isRequired}
                  onChange={(e) => setForm((s) => ({ ...s, isRequired: e.target.checked }))}
                  disabled={pending}
                />
                Обязательное
              </label>
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
            <p className="mb-2 text-xs font-medium text-slate-300">Текущие поля</p>
            {sorted.length === 0 ?
              <p className="text-xs text-slate-500">Пока нет полей. Создайте первое поле выше.</p>
            : <ul className="space-y-2">
                {sorted.map((field, index) => {
                  const optionDraft = optionDrafts[field.id] ?? {
                    name: "",
                    color: "#71717A"
                  };
                  const options = [...(field.selectOptions ?? [])].sort(
                    (a, b) => a.position - b.position
                  );
                  return (
                    <li
                      key={field.id}
                      className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-100">
                            {field.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {
                              FIELD_TYPE_OPTIONS.find((o) => o.value === field.fieldType)?.label
                            }{" "}
                            · {field.isRequired ? "обязательное" : "необязательное"}
                          </p>
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
                            className="text-rose-200 hover:bg-rose-950/40"
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
                        <div className="mt-3 rounded-md border border-slate-800/80 bg-slate-950/40 p-2">
                          <p className="mb-2 text-xs font-medium text-slate-300">
                            Варианты списка
                          </p>
                          <div className="space-y-1.5">
                            {options.length === 0 ?
                              <p className="text-xs text-slate-500">
                                Пока нет вариантов. Добавьте первый.
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
                                      className="min-w-[140px] flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
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
                                      className="h-8 w-10 cursor-pointer rounded border border-slate-700 bg-slate-900"
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
                                      className="text-rose-200 hover:bg-rose-950/40"
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
                              className="h-9 w-14 cursor-pointer rounded border border-slate-700 bg-slate-900"
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
                    </li>
                  );
                })}
              </ul>}
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
