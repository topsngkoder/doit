import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BoardCanvas } from "./board-canvas";
import type { NewCardFieldDefinition } from "./create-card-modal";
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
    .select("id, name, background_type, background_color, background_image_path")
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
  let canCreateCard = false;
  let canCreateColumn = false;
  let canRenameColumn = false;
  let canReorderColumn = false;
  let canDeleteColumn = false;
  let canEditCardAny = false;
  let canEditCardOwn = false;
  let canDeleteCardAny = false;
  let canDeleteCardOwn = false;
  let canMoveCards = false;
  if (memberRow?.board_role_id) {
    const { data: perms } = await supabase
      .from("board_role_permissions")
      .select("permission, allowed")
      .eq("board_role_id", memberRow.board_role_id)
      .in("permission", [
        "board.invite_members",
        "roles.manage",
        "cards.create",
        "cards.edit_any",
        "cards.edit_own",
        "cards.delete_any",
        "cards.delete_own",
        "columns.create",
        "columns.rename",
        "columns.reorder",
        "columns.delete",
        "cards.move"
      ]);

    for (const p of perms ?? []) {
      if (p.allowed !== true) continue;
      if (p.permission === "board.invite_members") canInvite = true;
      if (p.permission === "roles.manage") canManageRoles = true;
      if (p.permission === "cards.create") canCreateCard = true;
      if (p.permission === "cards.edit_any") canEditCardAny = true;
      if (p.permission === "cards.edit_own") canEditCardOwn = true;
      if (p.permission === "cards.delete_any") canDeleteCardAny = true;
      if (p.permission === "cards.delete_own") canDeleteCardOwn = true;
      if (p.permission === "columns.create") canCreateColumn = true;
      if (p.permission === "columns.rename") canRenameColumn = true;
      if (p.permission === "columns.reorder") canReorderColumn = true;
      if (p.permission === "columns.delete") canDeleteColumn = true;
      if (p.permission === "cards.move") canMoveCards = true;
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

  const { data: columnRows, error: columnsError } = await supabase
    .from("board_columns")
    .select("id, name, column_type, position")
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  const { data: cardRows, error: cardsError } = await supabase
    .from("cards")
    .select("id, column_id, title, description, position, created_by_user_id")
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  const { data: fieldDefRows } = await supabase
    .from("board_field_definitions")
    .select(
      `
      id,
      name,
      field_type,
      is_required,
      position,
      board_field_select_options ( id, name, color, position )
    `
    )
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  type OptRow = { id: string; name: string; color: string; position: number };
  type DefRow = {
    id: string;
    name: string;
    field_type: string;
    is_required: boolean;
    position: number;
    board_field_select_options: OptRow | OptRow[] | null;
  };

  const fieldDefinitions: NewCardFieldDefinition[] = (fieldDefRows ?? []).map((row) => {
    const d = row as unknown as DefRow;
    const raw = d.board_field_select_options;
    const opts: OptRow[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return {
      id: d.id,
      name: d.name,
      fieldType: d.field_type as NewCardFieldDefinition["fieldType"],
      isRequired: d.is_required,
      position: Number(d.position),
      selectOptions: opts.map((o) => ({
        id: o.id,
        name: o.name,
        color: o.color,
        position: Number(o.position)
      }))
    };
  });

  const columns =
    columnRows?.map((c) => ({
      id: c.id,
      name: c.name,
      columnType: c.column_type,
      position: c.position
    })) ?? [];

  const cardsByColumnId = new Map<
    string,
    Array<{
      id: string;
      title: string;
      description: string;
      position: number;
      createdByUserId: string;
    }>
  >();

  for (const col of columns) {
    cardsByColumnId.set(col.id, []);
  }

  for (const row of cardRows ?? []) {
    const list = cardsByColumnId.get(row.column_id);
    if (list) {
      list.push({
        id: row.id,
        title: row.title,
        description: row.description ?? "",
        position: row.position,
        createdByUserId: row.created_by_user_id
      });
    }
  }

  for (const list of cardsByColumnId.values()) {
    list.sort((a, b) => a.position - b.position);
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

  const membersForNewCard = members.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    email: m.email
  }));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 pb-10">
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
      {(columnsError || cardsError) && (
        <p className="rounded-lg border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
          Не удалось загрузить колонки или карточки. Проверьте сеть и права{" "}
          <code className="text-amber-50/90">board.view</code>.
        </p>
      )}
      <BoardCanvas
        boardId={board.id}
        currentUserId={user!.id}
        canCreateCard={canCreateCard}
        membersForNewCard={membersForNewCard}
        fieldDefinitions={fieldDefinitions}
        cardContentPermissions={{
          canEditAny: canEditCardAny,
          canEditOwn: canEditCardOwn,
          canDeleteAny: canDeleteCardAny,
          canDeleteOwn: canDeleteCardOwn
        }}
        columnPermissions={{
          canCreate: canCreateColumn,
          canRename: canRenameColumn,
          canReorder: canReorderColumn,
          canDelete: canDeleteColumn
        }}
        canMoveCards={canMoveCards}
        board={{
          backgroundType: board.background_type as "color" | "image",
          backgroundColor: board.background_color,
          backgroundImagePath: board.background_image_path
        }}
        columns={columns}
        cardsByColumnId={cardsByColumnId}
      />
    </main>
  );
}
