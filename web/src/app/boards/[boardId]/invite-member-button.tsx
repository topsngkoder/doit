"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  inviteBoardMemberAction,
  type InviteBoardMemberResult
} from "./actions";

type InviteMemberButtonProps = {
  boardId: string;
  canInvite: boolean;
};

const initialState: InviteBoardMemberResult = { ok: false, message: "" };

function InviteSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Отправка…" : "Отправить"}
    </Button>
  );
}

function InviteMemberForm({
  boardId,
  onSuccess
}: {
  boardId: string;
  onSuccess: () => void;
}) {
  const boundInvite = inviteBoardMemberAction.bind(null, boardId);
  const [state, formAction] = React.useActionState(boundInvite, initialState);

  React.useEffect(() => {
    if (state.ok) {
      onSuccess();
    }
  }, [state.ok, onSuccess]);

  return (
    <form action={formAction} className="space-y-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-400">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="colleague@example.com"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600"
        />
      </label>
      {state.ok === false && state.message ? (
        <p className="text-sm text-rose-400">{state.message}</p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-emerald-400">Приглашение создано.</p>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <InviteSubmitButton />
      </div>
    </form>
  );
}

export function InviteMemberButton({ boardId, canInvite }: InviteMemberButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [formInstance, setFormInstance] = React.useState(0);

  const handleSuccess = React.useCallback(() => {
    setOpen(false);
    setFormInstance((n) => n + 1);
  }, []);

  if (!canInvite) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-9 w-9 shrink-0 rounded-full p-0 text-lg leading-none"
        aria-label="Пригласить по email"
        title="Пригласить по email"
        onClick={() => setOpen(true)}
      >
        +
      </Button>
      <Modal open={open} title="Пригласить на доску" onClose={() => setOpen(false)}>
        <p className="mb-4 text-slate-400">
          Отправится приглашение на указанный email. Повторный pending для того же адреса на этой
          доске невозможен.
        </p>
        <InviteMemberForm key={formInstance} boardId={boardId} onSuccess={handleSuccess} />
        <div className="mt-3 flex justify-end border-t border-slate-800 pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Отмена
          </Button>
        </div>
      </Modal>
    </>
  );
}
