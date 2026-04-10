"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  createBoardColumnAction,
  type ColumnMutationResult
} from "./actions";
import { COLUMN_TYPES, columnTypeLabel } from "./column-types";

type BoardColumnCreateFormProps = {
  boardId: string;
  sourceColumnId: string;
  sourceColumnName: string;
  onSuccess: (newColumnId?: string) => void;
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

export function BoardColumnCreateForm({
  boardId,
  sourceColumnId,
  sourceColumnName,
  onSuccess
}: BoardColumnCreateFormProps) {
  const bound = createBoardColumnAction.bind(null, boardId);
  const [state, formAction] = React.useActionState(bound, initialState);

  React.useEffect(() => {
    if (state.ok) {
      onSuccess(state.newColumnId);
    }
  }, [state.ok, state.newColumnId, onSuccess]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="source_column_id" value={sourceColumnId} />
      <p className="text-xs text-app-tertiary">
        Новая колонка будет добавлена сразу после колонки "{sourceColumnName}".
      </p>
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
