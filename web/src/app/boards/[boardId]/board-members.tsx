"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { updateBoardMemberRoleAction } from "./actions";
import { InviteMemberButton } from "./invite-member-button";

export type BoardRoleOption = {
  id: string;
  key: string;
  name: string;
};

export type BoardMemberPublic = {
  userId: string;
  roleId: string;
  isOwner: boolean;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  roleName: string;
  roleKey: string;
};

const PRESET_ROLE_ORDER = ["viewer", "editor", "basic", "board_admin"];

function sortRoleOptions(roles: BoardRoleOption[]): BoardRoleOption[] {
  return [...roles].sort((a, b) => {
    const ia = PRESET_ROLE_ORDER.indexOf(a.key);
    const ib = PRESET_ROLE_ORDER.indexOf(b.key);
    const oa = ia === -1 ? PRESET_ROLE_ORDER.length : ia;
    const ob = ib === -1 ? PRESET_ROLE_ORDER.length : ib;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name, "ru");
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AvatarCircle({
  label,
  src,
  size = "sm"
}: {
  label: string;
  src: string | null;
  size?: "sm" | "md";
}) {
  const dim = size === "md" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={label}
        title={label}
        className={cn(dim, "rounded-full object-cover")}
      />
    );
  }
  return (
    <div
      className={cn(
        dim,
        "flex items-center justify-center rounded-full bg-slate-700 font-medium text-slate-200"
      )}
      title={label}
      aria-label={label}
    >
      {initials(label)}
    </div>
  );
}

export function BoardMembersPanel({
  boardId,
  members,
  roles,
  canInvite,
  canManageRoles
}: {
  boardId: string;
  members: BoardMemberPublic[];
  roles: BoardRoleOption[];
  canInvite: boolean;
  canManageRoles: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pendingUserId, setPendingUserId] = React.useState<string | null>(null);
  const [roleErrorUserId, setRoleErrorUserId] = React.useState<string | null>(null);
  const [roleErrorMessage, setRoleErrorMessage] = React.useState<string | null>(null);

  const sortedRoles = React.useMemo(() => sortRoleOptions(roles), [roles]);

  const sorted = React.useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      return a.displayName.localeCompare(b.displayName, "ru");
    });
  }, [members]);

  const onRoleChange = React.useCallback(
    async (memberUserId: string, nextRoleId: string) => {
      setRoleErrorUserId(null);
      setRoleErrorMessage(null);
      setPendingUserId(memberUserId);
      const res = await updateBoardMemberRoleAction(boardId, memberUserId, nextRoleId);
      setPendingUserId(null);
      if (!res.ok) {
        setRoleErrorUserId(memberUserId);
        setRoleErrorMessage(res.message);
        return;
      }
      router.refresh();
    },
    [boardId, router]
  );

  const preview = sorted.slice(0, 3);
  const overflow = Math.max(0, sorted.length - preview.length);

  if (sorted.length === 0) {
    return null;
  }

  return (
    <>
      <div className="group flex items-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center rounded-full outline-none ring-offset-2 ring-offset-slate-950 focus-visible:ring-2 focus-visible:ring-sky-500"
          aria-label={`Участники доски, ${sorted.length}`}
        >
          <span className="flex items-center pr-1">
            {preview.map((m, i) => (
              <span
                key={m.userId}
                className={cn(
                  "relative rounded-full ring-2 ring-slate-950",
                  i > 0 && "-ml-2"
                )}
                style={{ zIndex: preview.length - i }}
              >
                <AvatarCircle label={m.displayName} src={m.avatarUrl} />
              </span>
            ))}
            {overflow > 0 ? (
              <span
                className={cn(
                  "relative -ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-100 ring-2 ring-slate-950"
                )}
                style={{ zIndex: 0 }}
              >
                +{overflow}
              </span>
            ) : null}
          </span>
        </button>
        <InviteMemberButton
          boardId={boardId}
          canInvite={canInvite}
          triggerClassName="-ml-2 h-8 w-8 shrink-0 rounded-full border-0 bg-slate-700 p-0 text-sm font-semibold leading-none text-slate-100 ring-2 ring-slate-950 hover:bg-slate-600"
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pl-1.5 text-sm text-slate-400 underline-offset-2 outline-none ring-offset-2 ring-offset-slate-950 transition-colors hover:text-slate-200 hover:underline focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          Участники
        </button>
      </div>

      <Modal open={open} title="Участники доски" onClose={() => setOpen(false)}>
        <p className="mb-3 text-slate-400">
          На доске {sorted.length} {memberWord(sorted.length)}. Доступно всем, у кого есть право
          просмотра доски.
        </p>
        <ul className="max-h-[min(60vh,420px)] space-y-2 overflow-y-auto pr-1">
          {sorted.map((m) => (
            <li
              key={m.userId}
              className="flex items-center gap-3 rounded-md border border-slate-800/80 bg-slate-900/40 px-3 py-2"
            >
              <AvatarCircle label={m.displayName} src={m.avatarUrl} size="md" />
              <div className="min-w-0 flex flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-slate-100">{m.displayName}</span>
                  {m.isOwner ? (
                    <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                      Владелец
                    </span>
                  ) : null}
                </div>
                <span className="truncate text-xs text-slate-500">{m.email}</span>
                {canManageRoles && !m.isOwner ? (
                  <label className="mt-1 flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">Роль</span>
                    <select
                      value={m.roleId}
                      disabled={pendingUserId === m.userId}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v && v !== m.roleId) void onRoleChange(m.userId, v);
                      }}
                      className="max-w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600 disabled:opacity-50"
                    >
                      {sortedRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.key})
                        </option>
                      ))}
                    </select>
                    {roleErrorUserId === m.userId && roleErrorMessage ? (
                      <span className="text-xs text-rose-400">{roleErrorMessage}</span>
                    ) : null}
                  </label>
                ) : (
                  <span className="text-xs text-slate-400">
                    Роль: <span className="text-slate-300">{m.roleName}</span>
                    {m.roleKey ? (
                      <span className="text-slate-600"> ({m.roleKey})</span>
                    ) : null}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        {canInvite ? (
          <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
            Чтобы пригласить нового участника по email, нажмите кнопку «+» в шапке доски.
          </p>
        ) : null}
      </Modal>
    </>
  );
}

function memberWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "участник";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "участника";
  return "участников";
}
