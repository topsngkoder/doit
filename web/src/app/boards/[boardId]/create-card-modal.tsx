"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  createCardAction,
  type CreateCardResult
} from "./actions";
import {
  buildEmptyFieldDrafts,
  buildFieldValuesPayload,
  isValidHttpUrl,
  validateRequiredCustomFields,
  type FieldDraft,
  type NewCardFieldDefinition
} from "./card-field-drafts";
import {
  getYandexDiskCardFieldUnavailableCopy,
  yandexDiskCardFieldNonActiveIntegrationHint
} from "@/lib/yandex-disk/yandex-disk-card-field-empty-copy";
import {
  useBoardYandexDiskIntegration,
  useCanManageBoardYandexDiskIntegration
} from "./board-yandex-disk-integration-context";

export type NewCardMemberOption = {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
};

export type { NewCardFieldDefinition };

const inputClass = "field-base";

type CreateCardModalProps = {
  open: boolean;
  boardId: string;
  columnId: string;
  onClose: () => void;
  fieldDefinitions: NewCardFieldDefinition[];
  currentUserId: string;
};

export function CreateCardModal({
  open,
  boardId,
  columnId,
  onClose,
  fieldDefinitions,
  currentUserId
}: CreateCardModalProps) {
  const yandexDiskIntegration = useBoardYandexDiskIntegration();
  const canManageYandexDiskIntegration = useCanManageBoardYandexDiskIntegration();
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [drafts, setDrafts] = React.useState<Record<string, FieldDraft>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setDrafts(buildEmptyFieldDrafts(fieldDefinitions));
    setError(null);
    setPending(false);
  }, [open, columnId, currentUserId, fieldDefinitions]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const t = title.trim();
    if (!t || t.length > 200) {
      setError("Название: от 1 до 200 символов.");
      return;
    }
    if (!currentUserId) {
      setError("Не удалось определить текущего пользователя.");
      return;
    }

    const reqErr = validateRequiredCustomFields(fieldDefinitions, drafts);
    if (reqErr) {
      setError(reqErr);
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
      description,
      assigneeUserIds: [currentUserId],
      fieldValues: buildFieldValuesPayload(fieldDefinitions, drafts)
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
          <span className="text-xs text-app-secondary">Название *</span>
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

        <label className="flex flex-col gap-1">
          <span className="text-xs text-app-secondary">Описание</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={50000}
            placeholder="Добавьте описание карточки"
            className={inputClass}
          />
        </label>

        {sortedFields.map((f) => {
          const d = drafts[f.id];
          const reqLabel = f.isRequired ? " *" : "";
          if (!d) return null;

          if (f.fieldType === "text" && d.fieldType === "text") {
            return (
              <label key={f.id} className="flex flex-col gap-1">
                <span className="text-xs text-app-secondary">
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
                <span className="text-xs text-app-secondary">
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
              <div
                key={f.id}
                className="space-y-2 rounded-[var(--radius-control)] border border-app-divider bg-app-surface-muted p-3"
              >
                <p className="text-xs font-medium text-app-secondary">
                  {f.name}
                  {reqLabel}
                </p>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-app-tertiary">URL</span>
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
                  <span className="text-xs text-app-tertiary">Текст ссылки (необязательно)</span>
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
                <span className="text-xs text-app-secondary">
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

          if (f.fieldType === "yandex_disk" && d.fieldType === "yandex_disk") {
            const unavailableCopy = getYandexDiskCardFieldUnavailableCopy(yandexDiskIntegration, {
              canManageIntegration: canManageYandexDiskIntegration
            });
            const yandexInactiveHint =
              yandexDiskIntegration?.status === "active" ?
                null
              : yandexDiskCardFieldNonActiveIntegrationHint(yandexDiskIntegration, {
                  canManageIntegration: canManageYandexDiskIntegration
                });
            return (
              <div
                key={f.id}
                className="space-y-2 rounded-[var(--radius-control)] border border-app-divider bg-app-surface-muted p-3"
              >
                <p className="text-xs font-medium text-app-secondary">
                  {f.name}
                  {reqLabel}
                </p>
                <p className="text-xs text-app-tertiary">
                  После создания карточки файлы можно добавить в этом поле в окне редактирования (вкладка
                  «Детали»).
                </p>
                {yandexInactiveHint ?
                  <p className="text-xs text-app-secondary">{yandexInactiveHint}</p>
                : null}
                {unavailableCopy?.ownerActionHint ?
                  <p className="text-xs text-app-secondary">{unavailableCopy.ownerActionHint}</p>
                : null}
              </div>
            );
          }

          return null;
        })}

        {error ? (
          <p className="text-app-validation-error text-sm" role="alert">
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
  fieldDefinitions: NewCardFieldDefinition[];
  currentUserId: string;
};

export function CreateCardButton({
  boardId,
  columnId,
  canCreate,
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
        className="focus-ring-app w-full rounded-[var(--radius-control)] border border-dashed border-app-strong bg-app-surface-muted py-2 text-xs font-medium text-app-secondary transition-colors hover:border-app-accent hover:bg-app-surface hover:text-app-primary"
      >
        + Карточка
      </button>
      <CreateCardModal
        open={open}
        boardId={boardId}
        columnId={columnId}
        onClose={() => setOpen(false)}
        fieldDefinitions={fieldDefinitions}
        currentUserId={currentUserId}
      />
    </>
  );
}
