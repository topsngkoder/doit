import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BoardMembersPanel, type BoardMemberPublic, type BoardRoleOption } from "./board-members";
import { InviteMemberButton } from "./invite-member-button";

type BoardPageProps = {
  params: Promise<{ boardId: string }>;
};

export default async function BoardPage({ params }: BoardPageProps) {
  const { boardId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  const isSessionMissing = authError?.message === "Auth session missing!";
  const isAuthenticated = !!user && !(authError && !isSessionMissing);

  if (!isAuthenticated) {
    redirect("/login");
  }

  const { data: board, error: boardError } = await supabase
    .from("boards")
    .select("id, name")
    .eq("id", boardId)
    .maybeSingle();

  if (boardError || !board) {
    notFound();
  }

  const { data: memberRow } = await supabase
    .from("board_members")
    .select("board_role_id")
    .eq("board_id", boardId)
    .eq("user_id", user!.id)
    .maybeSingle();

  let canInvite = false;
  let canManageRoles = false;
  if (memberRow?.board_role_id) {
    const { data: perms } = await supabase
      .from("board_role_permissions")
      .select("permission, allowed")
      .eq("board_role_id", memberRow.board_role_id)
      .in("permission", ["board.invite_members", "roles.manage"]);

    for (const p of perms ?? []) {
      if (p.permission === "board.invite_members" && p.allowed === true) canInvite = true;
      if (p.permission === "roles.manage" && p.allowed === true) canManageRoles = true;
    }
  }

  const { data: roleRows } = await supabase
    .from("board_roles")
    .select("id, key, name")
    .eq("board_id", boardId);

  const boardRoles: BoardRoleOption[] = (roleRows ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name
  }));

  const { data: memberRowsRaw } = await supabase
    .from("board_members")
    .select(
      `
      user_id,
      board_role_id,
      is_owner,
      profiles ( display_name, email, avatar_url ),
      board_roles ( name, key )
    `
    )
    .eq("board_id", boardId);

  type ProfileEmbed = { display_name: string; email: string; avatar_url: string | null };
  type RoleEmbed = { name: string; key: string };

  function unwrapOne<T>(v: T | T[] | null | undefined): T | null {
    if (v == null) return null;
    return Array.isArray(v) ? (v[0] ?? null) : v;
  }

  const members: BoardMemberPublic[] = (memberRowsRaw ?? []).map((row) => {
    const profile = unwrapOne(row.profiles as ProfileEmbed | ProfileEmbed[] | null);
    const role = unwrapOne(row.board_roles as RoleEmbed | RoleEmbed[] | null);
    return {
      userId: row.user_id,
      roleId: row.board_role_id,
      isOwner: row.is_owner,
      displayName: profile?.display_name?.trim() || "Участник",
      email: profile?.email ?? "",
      avatarUrl: profile?.avatar_url ?? null,
      roleName: role?.name ?? "",
      roleKey: role?.key ?? ""
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            href="/boards"
            className="shrink-0 text-sm text-slate-400 hover:text-slate-200"
          >
            ← Мои доски
          </Link>
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-slate-50">
            {board.name}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <BoardMembersPanel
            boardId={board.id}
            members={members}
            roles={boardRoles}
            canInvite={canInvite}
            canManageRoles={canManageRoles}
          />
          <InviteMemberButton boardId={board.id} canInvite={canInvite} />
        </div>
      </div>
      <p className="text-sm text-slate-400">
        Экран колонок и карточек появится в F1. Сейчас доступны приглашения (
        <code className="text-slate-300">board.invite_members</code>) и смена ролей участникам (
        <code className="text-slate-300">roles.manage</code>), кроме владельца.
      </p>
    </main>
  );
}
