"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  createBoardColumnAction,
  type ColumnMutationResult
} from "./actions";
import { COLUMN_TYPES, columnTypeLabel } from "./column-types";

type AddBoardColumnButtonProps = {
  boardId: string;
  canCreate: boolean;
};

const initialState: ColumnMutationResult = { ok: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Создание…" : "Создать"}
    </Button>
  );
}

function CreateColumnForm({
  boardId,
  onSuccess
}: {
  boardId: string;
  onSuccess: () => void;
}) {
  const bound = createBoardColumnAction.bind(null, boardId);
  const [state, formAction] = useFormState(bound, initialState);

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
          placeholder="Новая колонка"
          className="field-base"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-app-tertiary">Тип</span>
        <select
          name="column_type"
          required
          defaultValue="queue"
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
      {state.ok ? (
        <p className="text-sm" style={{ color: "var(--success-subtle-text)" }}>Колонка создана.</p>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <SubmitButton />
      </div>
    </form>
  );
}

export function AddBoardColumnButton({ boardId, canCreate }: AddBoardColumnButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [formKey, setFormKey] = React.useState(0);

  const onSuccess = React.useCallback(() => {
    setOpen(false);
    setFormKey((k) => k + 1);
  }, []);

  if (!canCreate) {
    return null;
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        + Колонка
      </Button>
      <Modal open={open} title="Новая колонка" onClose={() => setOpen(false)}>
        <p className="mb-4 text-xs text-app-tertiary">
          Колонка добавляется в конец списка. Порядок можно менять стрелками в заголовке колонки.
        </p>
        <CreateColumnForm key={formKey} boardId={boardId} onSuccess={onSuccess} />
        <div className="mt-3 flex justify-end border-t border-app-divider pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Отмена
          </Button>
        </div>
      </Modal>
    </>
  );
}
