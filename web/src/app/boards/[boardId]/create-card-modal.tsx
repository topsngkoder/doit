"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  createCardAction,
  type CreateCardFieldValuePayload,
  type CreateCardResult
} from "./actions";

export type NewCardMemberOption = {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
};

export type NewCardFieldDefinition = {
  id: string;
  name: string;
  fieldType: "link" | "text" | "date" | "select";
  isRequired: boolean;
  position: number;
  selectOptions: Array<{ id: string; name: string; color: string; position: number }>;
};

type FieldDraft =
  | { fieldType: "text"; value: string }
  | { fieldType: "date"; value: string }
  | { fieldType: "link"; url: string; text: string }
  | { fieldType: "select"; optionId: string };

const inputClass =
  "rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600";

function buildInitialDrafts(defs: NewCardFieldDefinition[]): Record<string, FieldDraft> {
  const out: Record<string, FieldDraft> = {};
  for (const f of defs) {
    if (f.fieldType === "text") out[f.id] = { fieldType: "text", value: "" };
    else if (f.fieldType === "date") out[f.id] = { fieldType: "date", value: "" };
    else if (f.fieldType === "link") out[f.id] = { fieldType: "link", url: "", text: "" };
    else out[f.id] = { fieldType: "select", optionId: "" };
  }
  return out;
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

type CreateCardModalProps = {
  open: boolean;
  boardId: string;
  columnId: string;
  onClose: () => void;
  members: NewCardMemberOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  currentUserId: string;
};

export function CreateCardModal({
  open,
  boardId,
  columnId,
  onClose,
  members,
  fieldDefinitions,
  currentUserId
}: CreateCardModalProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [selectedUserIds, setSelectedUserIds] = React.useState<Set<string>>(new Set());
  const [drafts, setDrafts] = React.useState<Record<string, FieldDraft>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setSelectedUserIds(new Set(currentUserId ? [currentUserId] : []));
    setDrafts(buildInitialDrafts(fieldDefinitions));
    setError(null);
    setPending(false);
  }, [open, columnId, currentUserId, fieldDefinitions]);

  const toggleMember = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        if (next.size <= 1) return prev;
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const buildPayload = (): CreateCardFieldValuePayload[] => {
    const fieldValues: CreateCardFieldValuePayload[] = [];
    for (const f of fieldDefinitions) {
      const d = drafts[f.id];
      if (!d) continue;
      if (f.fieldType === "text" && d.fieldType === "text") {
        fieldValues.push({
          field_definition_id: f.id,
          ...(d.value.trim() ? { text_value: d.value.trim() } : {})
        });
      } else if (f.fieldType === "date" && d.fieldType === "date") {
        fieldValues.push({
          field_definition_id: f.id,
          ...(d.value.trim() ? { date_value: d.value.trim() } : {})
        });
      } else if (f.fieldType === "link" && d.fieldType === "link") {
        fieldValues.push({
          field_definition_id: f.id,
          ...(d.url.trim() ? { link_url: d.url.trim() } : {}),
          ...(d.text.trim() ? { link_text: d.text.trim() } : {})
        });
      } else if (f.fieldType === "select" && d.fieldType === "select") {
        fieldValues.push({
          field_definition_id: f.id,
          ...(d.optionId.trim() ? { select_option_id: d.optionId.trim() } : {})
        });
      }
    }
    return fieldValues;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const t = title.trim();
    if (!t || t.length > 200) {
      setError("Название: от 1 до 200 символов.");
      return;
    }
    if (selectedUserIds.size < 1) {
      setError("Выберите хотя бы одного участника.");
      return;
    }

    for (const f of fieldDefinitions) {
      const d = drafts[f.id];
      if (f.fieldType === "link" && d?.fieldType === "link") {
        const u = d.url.trim();
        if (u && !isValidHttpUrl(u)) {
          setError(`Поле «${f.name}»: укажите корректную ссылку (http/https).`);
          return;
        }
      }
    }

    setPending(true);
    const res: CreateCardResult = await createCardAction(boardId, {
      columnId,
      title: t,
      assigneeUserIds: [...selectedUserIds],
      fieldValues: buildPayload()
    });
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onClose();
    router.refresh();
  };

  const sortedFields = [...fieldDefinitions].sort((a, b) => a.position - b.position);

  return (
    <Modal open={open} title="Новая карточка" onClose={onClose} className="max-w-xl">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Название *</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            autoFocus
            placeholder="Задача или тема"
            className={inputClass}
          />
        </label>

        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            Участники * (по умолчанию — вы; минимум один)
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-800 p-2">
            {members.map((m) => (
              <li key={m.userId}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-slate-600"
                    checked={selectedUserIds.has(m.userId)}
                    onChange={() => toggleMember(m.userId)}
                  />
                  <span className="text-slate-100">{m.displayName}</span>
                  <span className="truncate text-xs text-slate-500">{m.email}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        {sortedFields.map((f) => {
          const d = drafts[f.id];
          const reqLabel = f.isRequired ? " *" : "";
          if (!d) return null;

          if (f.fieldType === "text" && d.fieldType === "text") {
            return (
              <label key={f.id} className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">
                  {f.name}
                  {reqLabel}
                </span>
                <textarea
                  value={d.value}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [f.id]: { fieldType: "text", value: e.target.value }
                    }))
                  }
                  rows={3}
                  className={inputClass}
                />
              </label>
            );
          }

          if (f.fieldType === "date" && d.fieldType === "date") {
            return (
              <label key={f.id} className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">
                  {f.name}
                  {reqLabel}
                </span>
                <input
                  type="date"
                  value={d.value}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [f.id]: { fieldType: "date", value: e.target.value }
                    }))
                  }
                  className={inputClass}
                />
              </label>
            );
          }

          if (f.fieldType === "link" && d.fieldType === "link") {
            return (
              <div key={f.id} className="space-y-2 rounded-md border border-slate-800/80 p-3">
                <p className="text-xs font-medium text-slate-400">
                  {f.name}
                  {reqLabel}
                </p>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">URL</span>
                  <input
                    type="url"
                    value={d.url}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [f.id]: {
                          fieldType: "link",
                          url: e.target.value,
                          text: d.text
                        }
                      }))
                    }
                    placeholder="https://…"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Текст ссылки (необязательно)</span>
                  <input
                    value={d.text}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [f.id]: {
                          fieldType: "link",
                          url: d.url,
                          text: e.target.value
                        }
                      }))
                    }
                    className={inputClass}
                  />
                </label>
              </div>
            );
          }

          if (f.fieldType === "select" && d.fieldType === "select") {
            const opts = [...f.selectOptions].sort((a, b) => a.position - b.position);
            return (
              <label key={f.id} className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">
                  {f.name}
                  {reqLabel}
                </span>
                <select
                  value={d.optionId}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [f.id]: { fieldType: "select", optionId: e.target.value }
                    }))
                  }
                  className={inputClass}
                >
                  {!f.isRequired ? (
                    <option value="">— не выбрано —</option>
                  ) : (
                    <option value="" disabled>
                      Выберите…
                    </option>
                  )}
                  {opts.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          }

          return null;
        })}

        {error ? (
          <p className="text-sm text-rose-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type CreateCardButtonProps = {
  boardId: string;
  columnId: string;
  canCreate: boolean;
  members: NewCardMemberOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  currentUserId: string;
};

export function CreateCardButton({
  boardId,
  columnId,
  canCreate,
  members,
  fieldDefinitions,
  currentUserId
}: CreateCardButtonProps) {
  const [open, setOpen] = React.useState(false);

  if (!canCreate) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md border border-dashed border-slate-700 bg-slate-900/40 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-sky-600/60 hover:bg-slate-900/70 hover:text-sky-200"
      >
        + Карточка
      </button>
      <CreateCardModal
        open={open}
        boardId={boardId}
        columnId={columnId}
        onClose={() => setOpen(false)}
        members={members}
        fieldDefinitions={fieldDefinitions}
        currentUserId={currentUserId}
      />
    </>
  );
}
