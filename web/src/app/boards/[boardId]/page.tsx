import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BoardCanvas } from "./board-canvas";
import { mapCardReadyAttachmentsRowsByCardId, toBoardSnapshotPayload } from "@/lib/board-snapshot-types";
import type {
  BoardLabelOption,
  BoardCardListItem,
  BoardCardPreviewItem,
  CardActivityEntry,
  CardFieldValueSnapshot
} from "./column-types";
import type { NewCardFieldDefinition } from "./card-field-drafts";
import { BoardMembersPanel, type BoardMemberPublic, type BoardRoleOption } from "./board-members";
import { BoardSettingsMenu } from "./board-settings-menu";
import { yandexDiskOauthReturnBannerMessage } from "@/lib/yandex-disk/yandex-disk-product-messages";

const AVATARS_BUCKET = "avatars";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type BoardPageProps = {
  params: Promise<{ boardId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BoardPage({ params, searchParams }: BoardPageProps) {
  const { boardId } = await params;
  const sp = searchParams ? await searchParams : {};
  const oauthRaw = sp.yandex_disk_oauth;
  const oauthFlag = Array.isArray(oauthRaw) ? oauthRaw[0] : oauthRaw;
  const yandexDiskOauthBanner = yandexDiskOauthReturnBannerMessage(oauthFlag);
  const supabase = await createSupabaseServerClient();

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

  const snapshot = toBoardSnapshotPayload(snapshotRaw);

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
  /** Перемещение карточек между колонками; не совпадает с «открыть карточку» (`canOpenCardModal`). */
  const canMoveCards = has("cards.move");
  const canCreateComment = has("comments.create");
  const canEditOwnComment = has("comments.edit_own");
  const canDeleteOwnComment = has("comments.delete_own");
  const canModerateComments = has("comments.moderate");
  const canManageBoardLabels = has("labels.manage");
  const canManageCardFields = has("card_fields.manage");
  const canManageCardPreview = has("card_preview.manage");
  const canChangeBoardBackground = has("board.change_background");
  // get_board_snapshot уже отсекает вызовы без board.view; в JSON allowed_permissions право
  // board.view не попадает — его нет в v_ui_perm_list RPC, поэтому has("board.view") всегда false.
  const canViewYandexDiskIntegration = true;
  const canManageYandexDiskIntegration =
    snapshot.is_system_admin ||
    (snapshot.members ?? []).some(
      (m) => m.user_id === snapshot.current_user_id && m.is_owner
    );

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

  const readyAttachmentsByCardId = mapCardReadyAttachmentsRowsByCardId(snapshot.card_ready_attachments);

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
        activityEntries: activityByCard.get(row.id) ?? [],
        readyAttachmentsByFieldId: readyAttachmentsByCardId.get(row.id) ?? {}
      });
    }
  }

  for (const list of cardsByColumnId.values()) {
    list.sort((a, b) => a.position - b.position);
  }

  const avatarPaths = Array.from(
    new Set(
      (snapshot.members ?? [])
        .map((m) => m.avatar_url)
        .filter((path): path is string => typeof path === "string" && path.length > 0)
    )
  );
  const signedAvatarByPath = new Map<string, string>();
  if (avatarPaths.length > 0) {
    await Promise.all(
      avatarPaths.map(async (path) => {
        const { data, error } = await supabase.storage
          .from(AVATARS_BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        if (!error && data?.signedUrl) {
          signedAvatarByPath.set(path, data.signedUrl);
        }
      })
    );
  }

  const members: BoardMemberPublic[] = (snapshot.members ?? []).map((row) => {
    return {
      userId: row.user_id,
      roleId: row.board_role_id,
      isOwner: row.is_owner,
      displayName: row.display_name?.trim() || "Участник",
      email: row.email ?? "",
      avatarUrl: row.avatar_url ? signedAvatarByPath.get(row.avatar_url) ?? null : null,
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
    <main className="-mx-4 grid h-full min-h-0 w-[calc(100%+2rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden pb-0 md:gap-4">
      {yandexDiskOauthBanner ? (
        <div
          className="shrink-0 rounded-md border border-app-divider bg-app-surface-muted px-3 py-2 text-sm text-app-secondary"
          role="status"
        >
          {yandexDiskOauthBanner}
        </div>
      ) : null}
      <div className="shrink-0">
        <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="ml-2 min-w-0 truncate text-2xl font-semibold tracking-tight text-app-primary">
            {board.name}
          </h1>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <BoardMembersPanel
            boardId={board.id}
            members={members}
            roles={boardRoles}
            canInvite={canInvite}
            canManageRoles={canManageRoles}
          />
          <BoardSettingsMenu
            boardId={board.id}
            canManageBoardLabels={canManageBoardLabels}
            canManageCardFields={canManageCardFields}
            canManageCardPreview={canManageCardPreview}
            canChangeBoardBackground={canChangeBoardBackground}
            canViewYandexDiskIntegration={canViewYandexDiskIntegration}
            canManageYandexDiskIntegration={canManageYandexDiskIntegration}
            yandexDiskIntegration={snapshot.yandex_disk_integration}
            boardLabels={boardLabels}
            fieldDefinitions={fieldDefinitions}
            previewItems={previewItems}
            hasBackgroundImage={
              board.background_type === "image" && !!board.background_image_path
            }
          />
        </div>
      </div>
      </div>
      <div className="min-h-0 overflow-hidden">
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
            backgroundType: board.background_type as "none" | "image",
            backgroundImagePath: board.background_image_path
          }}
          columns={columns}
          cardsByColumnId={cardsByColumnId}
          yandexDiskIntegration={snapshot.yandex_disk_integration}
        />
      </div>
    </main>
  );
}
