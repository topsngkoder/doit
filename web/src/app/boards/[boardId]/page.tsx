import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BoardCanvas } from "./board-canvas";
import type {
  BoardLabelOption,
  BoardCardListItem,
  BoardCardPreviewItem,
  CardActivityEntry,
  CardFieldValueSnapshot
} from "./column-types";
import type { NewCardFieldDefinition } from "./card-field-drafts";
import { BoardMembersPanel, type BoardMemberPublic, type BoardRoleOption } from "./board-members";
import { BoardLabelsButton } from "./board-labels-button";
import { BoardFieldsButton } from "./board-fields-button";
import { BoardCardPreviewButton } from "./board-card-preview-button";
import { BoardBackgroundButton } from "./board-background-button";
import { InviteMemberButton } from "./invite-member-button";

type BoardPageProps = {
  params: Promise<{ boardId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BoardPage({ params, searchParams }: BoardPageProps) {
  const { boardId } = await params;

  const perfParams = (await searchParams) ?? {};
  const perfEnabledRaw = perfParams["perf"] ?? perfParams["__perf"];
  const perfEnabled =
    typeof perfEnabledRaw === "string" ? perfEnabledRaw === "1" : Array.isArray(perfEnabledRaw)
      ? perfEnabledRaw.includes("1")
      : false;

  const perf =
    perfEnabled && process.env.NODE_ENV !== "production"
      ? {
          total: 0,
          db: 0,
          auth: 0,
          storage: 0,
          other: 0
        }
      : null;

  const supabase = await createSupabaseServerClient({
    instrumentation: perf
      ? {
          onFetch(url) {
            perf.total += 1;
            if (url.includes("/rest/v1/")) perf.db += 1;
            else if (url.includes("/auth/v1/")) perf.auth += 1;
            else if (url.includes("/storage/v1/")) perf.storage += 1;
            else perf.other += 1;
          }
        }
      : undefined
  });

  const { data: snapshotRaw, error: snapshotError } = await supabase.rpc("get_board_snapshot", {
    p_board_id: boardId
  });

  if (snapshotError || !snapshotRaw) {
    const msg = snapshotError?.message ?? "";
    if (/not authenticated|auth session missing|jwt|invalid jwt|missing jwt/i.test(msg)) {
      redirect("/login");
    }
    notFound();
  }

  type SnapshotBoard = {
    id: string;
    name: string;
    background_type: "color" | "image";
    background_color: string | null;
    background_image_path: string | null;
  };

  type SnapshotRole = { id: string; key: string; name: string };
  type SnapshotMember = {
    user_id: string;
    board_role_id: string;
    is_owner: boolean;
    display_name: string;
    email: string;
    avatar_url: string | null;
    role_name: string;
    role_key: string;
  };
  type SnapshotColumn = { id: string; name: string; column_type: string; position: number };
  type SnapshotCard = {
    id: string;
    column_id: string;
    title: string;
    description: string;
    position: number;
    created_by_user_id: string;
    responsible_user_id: string | null;
  };
  type SnapshotLabel = { id: string; name: string; color: string; position: number };
  type SnapshotFieldOption = { id: string; name: string; color: string; position: number };
  type SnapshotFieldDefinition = {
    id: string;
    name: string;
    field_type: string;
    is_required: boolean;
    position: number;
    select_options: SnapshotFieldOption[];
  };
  type SnapshotPreviewItem = {
    id: string;
    item_type: string;
    field_definition_id: string | null;
    enabled: boolean;
    position: number;
  };
  type SnapshotCardAssignee = { card_id: string; user_id: string };
  type SnapshotCardLabel = { card_id: string; label_id: string };
  type SnapshotCardFieldValue = {
    card_id: string;
    field_definition_id: string;
    text_value: string | null;
    date_value: string | null;
    link_url: string | null;
    link_text: string | null;
    select_option_id: string | null;
  };
  type SnapshotActivity = {
    id: string;
    card_id: string;
    actor_user_id: string;
    actor_display_name: string;
    activity_type: string;
    message: string;
    created_at: string;
  };

  type Snapshot = {
    current_user_id: string;
    board: SnapshotBoard;
    is_system_admin: boolean;
    my_role_id: string | null;
    allowed_permissions: string[];
    roles: SnapshotRole[];
    members: SnapshotMember[];
    columns: SnapshotColumn[];
    cards: SnapshotCard[];
    labels: SnapshotLabel[];
    field_definitions: SnapshotFieldDefinition[];
    preview_items: SnapshotPreviewItem[];
    card_assignees: SnapshotCardAssignee[];
    card_labels: SnapshotCardLabel[];
    card_field_values: SnapshotCardFieldValue[];
    comments_count_by_card: Record<string, number>;
    activity: SnapshotActivity[];
  };

  const snapshot = snapshotRaw as unknown as Snapshot;

  const board = snapshot.board;
  const allowed = new Set(snapshot.allowed_permissions ?? []);
  const has = (p: string) => snapshot.is_system_admin || allowed.has(p);

  const canInvite = has("board.invite_members");
  const canManageRoles = has("roles.manage");
  const canCreateCard = has("cards.create");
  const canCreateColumn = has("columns.create");
  const canRenameColumn = has("columns.rename");
  const canReorderColumn = has("columns.reorder");
  const canDeleteColumn = has("columns.delete");
  const canEditCardAny = has("cards.edit_any");
  const canEditCardOwn = has("cards.edit_own");
  const canDeleteCardAny = has("cards.delete_any");
  const canDeleteCardOwn = has("cards.delete_own");
  const canMoveCards = has("cards.move");
  const canCreateComment = has("comments.create");
  const canEditOwnComment = has("comments.edit_own");
  const canDeleteOwnComment = has("comments.delete_own");
  const canModerateComments = has("comments.moderate");
  const canManageBoardLabels = has("labels.manage");
  const canManageCardFields = has("card_fields.manage");
  const canManageCardPreview = has("card_preview.manage");
  const canChangeBoardBackground = has("board.change_background");

  const boardRoles: BoardRoleOption[] = (snapshot.roles ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name
  }));

  const boardLabels: BoardLabelOption[] = (snapshot.labels ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    position: Number(l.position)
  }));

  const fieldDefinitions: NewCardFieldDefinition[] = (snapshot.field_definitions ?? []).map((d) => {
    return {
      id: d.id,
      name: d.name,
      fieldType: d.field_type as NewCardFieldDefinition["fieldType"],
      isRequired: d.is_required,
      position: Number(d.position),
      selectOptions: (d.select_options ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        color: o.color,
        position: Number(o.position)
      }))
    };
  });

  const columns = (snapshot.columns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    columnType: c.column_type,
    position: c.position
  }));

  const previewItems: BoardCardPreviewItem[] = (snapshot.preview_items ?? []).map((row) => ({
    id: row.id,
    itemType: row.item_type as BoardCardPreviewItem["itemType"],
    fieldDefinitionId: row.field_definition_id,
    enabled: row.enabled,
    position: Number(row.position)
  }));

  const cardIds = (snapshot.cards ?? []).map((r) => r.id);
  const assigneesByCard = new Map<string, string[]>();
  const labelIdsByCard = new Map<string, string[]>();
  const commentsCountByCard = new Map<string, number>();
  const fieldValuesByCard = new Map<string, Record<string, CardFieldValueSnapshot>>();
  const activityByCard = new Map<string, CardActivityEntry[]>();

  for (const a of snapshot.card_assignees ?? []) {
    const cur = assigneesByCard.get(a.card_id) ?? [];
    cur.push(a.user_id);
    assigneesByCard.set(a.card_id, cur);
  }

  for (const cl of snapshot.card_labels ?? []) {
    const cur = labelIdsByCard.get(cl.card_id) ?? [];
    cur.push(cl.label_id);
    labelIdsByCard.set(cl.card_id, cur);
  }

  for (const fv of snapshot.card_field_values ?? []) {
    const cur = fieldValuesByCard.get(fv.card_id) ?? {};
    cur[fv.field_definition_id] = {
      textValue: fv.text_value,
      dateValue: fv.date_value,
      linkUrl: fv.link_url,
      linkText: fv.link_text,
      selectOptionId: fv.select_option_id
    };
    fieldValuesByCard.set(fv.card_id, cur);
  }

  for (const [cid, cnt] of Object.entries(snapshot.comments_count_by_card ?? {})) {
    commentsCountByCard.set(cid, Number(cnt));
  }

  for (const a of snapshot.activity ?? []) {
    const cur = activityByCard.get(a.card_id) ?? [];
    cur.push({
      id: a.id,
      activityType: a.activity_type,
      message: a.message ?? "",
      createdAt: a.created_at,
      actorUserId: a.actor_user_id,
      actorDisplayName: a.actor_display_name ?? "Участник"
    });
    activityByCard.set(a.card_id, cur);
  }

  const cardsByColumnId = new Map<string, BoardCardListItem[]>();

  for (const col of columns) {
    cardsByColumnId.set(col.id, []);
  }

  for (const row of snapshot.cards ?? []) {
    const list = cardsByColumnId.get(row.column_id);
    if (list) {
      list.push({
        id: row.id,
        title: row.title,
        description: row.description ?? "",
        position: row.position,
        createdByUserId: row.created_by_user_id,
        responsibleUserId: row.responsible_user_id ?? null,
        assigneeUserIds: assigneesByCard.get(row.id) ?? [],
        labelIds: labelIdsByCard.get(row.id) ?? [],
        commentsCount: commentsCountByCard.get(row.id) ?? 0,
        fieldValues: fieldValuesByCard.get(row.id) ?? {},
        activityEntries: activityByCard.get(row.id) ?? []
      });
    }
  }

  for (const list of cardsByColumnId.values()) {
    list.sort((a, b) => a.position - b.position);
  }

  const members: BoardMemberPublic[] = (snapshot.members ?? []).map((row) => {
    return {
      userId: row.user_id,
      roleId: row.board_role_id,
      isOwner: row.is_owner,
      displayName: row.display_name?.trim() || "Участник",
      email: row.email ?? "",
      avatarUrl: row.avatar_url ?? null,
      roleName: row.role_name ?? "",
      roleKey: row.role_key ?? ""
    };
  });

  const membersForNewCard = members.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    email: m.email,
    avatarUrl: m.avatarUrl
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
          <BoardLabelsButton
            boardId={board.id}
            canManage={canManageBoardLabels}
            labels={boardLabels}
          />
          <BoardFieldsButton
            boardId={board.id}
            canManage={canManageCardFields}
            fieldDefinitions={fieldDefinitions}
          />
          <BoardCardPreviewButton
            boardId={board.id}
            canManage={canManageCardPreview}
            previewItems={previewItems}
            fieldDefinitions={fieldDefinitions}
          />
          <BoardBackgroundButton
            boardId={board.id}
            canManage={canChangeBoardBackground}
            currentType={board.background_type as "color" | "image"}
            currentColor={board.background_color}
          />
          <InviteMemberButton boardId={board.id} canInvite={canInvite} />
        </div>
      </div>
      <BoardCanvas
        boardId={board.id}
        currentUserId={snapshot.current_user_id}
        canCreateCard={canCreateCard}
        membersForNewCard={membersForNewCard}
        boardLabels={boardLabels}
        previewItems={previewItems}
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
        canCreateComment={canCreateComment}
        canEditOwnComment={canEditOwnComment}
        canDeleteOwnComment={canDeleteOwnComment}
        canModerateComments={canModerateComments}
        board={{
          backgroundType: board.background_type as "color" | "image",
          backgroundColor: board.background_color,
          backgroundImagePath: board.background_image_path
        }}
        columns={columns}
        cardsByColumnId={cardsByColumnId}
      />

      {perf && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium text-slate-100">Perf: SSR запросы Supabase</div>
            <div className="text-slate-400">
              Включено через <code className="text-slate-200">?perf=1</code>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded-md bg-slate-900/60 px-2 py-1">
              <div className="text-slate-400">Всего</div>
              <div className="text-slate-50">{perf.total}</div>
            </div>
            <div className="rounded-md bg-slate-900/60 px-2 py-1">
              <div className="text-slate-400">DB</div>
              <div className="text-slate-50">{perf.db}</div>
            </div>
            <div className="rounded-md bg-slate-900/60 px-2 py-1">
              <div className="text-slate-400">Auth</div>
              <div className="text-slate-50">{perf.auth}</div>
            </div>
            <div className="rounded-md bg-slate-900/60 px-2 py-1">
              <div className="text-slate-400">Storage</div>
              <div className="text-slate-50">{perf.storage}</div>
            </div>
            <div className="rounded-md bg-slate-900/60 px-2 py-1">
              <div className="text-slate-400">Other</div>
              <div className="text-slate-50">{perf.other}</div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
