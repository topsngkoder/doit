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
  triggerClassName?: string;
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
          className="field-base"
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

export function InviteMemberButton({ boardId, canInvite, triggerClassName }: InviteMemberButtonProps) {
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
        className={
          triggerClassName ??
          "h-8 w-8 shrink-0 rounded-full border-0 bg-slate-700 p-0 text-sm font-semibold leading-none text-slate-100 ring-2 ring-slate-950 hover:bg-slate-600"
        }
        aria-label="Пригласить по email"
        title="Пригласить по email"
        onClick={() => setOpen(true)}
      >
        +
      </Button>
      <Modal open={open} title="Пригласить на доску" onClose={() => setOpen(false)}>
        <InviteMemberForm key={formInstance} boardId={boardId} onSuccess={handleSuccess} />
      </Modal>
    </>
  );
}
