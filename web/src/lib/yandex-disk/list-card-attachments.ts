import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeUuidParam } from "@/lib/board-id-param";

import type { CardAttachmentReadyListItem } from "@/lib/card-attachment-ui-types";

import { assertCardYandexDiskFieldDefinition } from "./assert-card-yandex-disk-field-definition";
import { YANDEX_DISK_MSG_AUTH_REQUIRED } from "./yandex-disk-product-messages";

export type { CardAttachmentReadyListItem };

/** YDB4.6: в постоянном списке только `ready` — см. RLS и явный фильтр ниже. */

export type ListReadyCardAttachmentsResult =
  | { ok: true; attachments: CardAttachmentReadyListItem[] }
  | { ok: false; message: string };

/** Строка вложения со всеми статусами — только service-role / доверенный сервер (cleanup YDB9 и т.п.). */
export type CardAttachmentAllStatusesRow = {
  id: string;
  board_id: string;
  card_id: string;
  field_definition_id: string;
  storage_provider: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by_user_id: string;
  uploaded_at: string;
  status: "uploading" | "ready" | "failed";
};

export type ListCardAttachmentsAllStatusesResult =
  | { ok: true; attachments: CardAttachmentAllStatusesRow[] }
  | { ok: false; message: string };

function invalidIdsResult(): ListReadyCardAttachmentsResult {
  return { ok: false, message: "Некорректный идентификатор доски, карточки или поля." };
}

/**
 * Список готовых вложений карточки для текущего пользователя (сессия).
 * RLS: только `status = 'ready'` и `board.view`; `uploading`/`failed` не видны.
 */
export async function listReadyCardAttachmentsForViewer(
  supabase: SupabaseClient,
  input: { boardId: string; cardId: string; fieldDefinitionId: string }
): Promise<ListReadyCardAttachmentsResult> {
  const boardId = normalizeUuidParam(input.boardId);
  const cardId = normalizeUuidParam(input.cardId);
  const fieldDefinitionId = normalizeUuidParam(input.fieldDefinitionId);
  if (!boardId || !cardId || !fieldDefinitionId) {
    return invalidIdsResult();
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, message: YANDEX_DISK_MSG_AUTH_REQUIRED };
  }

  const fieldOk = await assertCardYandexDiskFieldDefinition(supabase, {
    boardId,
    cardId,
    fieldDefinitionId
  });
  if (!fieldOk.ok) {
    return fieldOk;
  }

  const { data: rows, error: attError } = await supabase
    .from("card_attachments")
    .select(
      "id, field_definition_id, original_file_name, mime_type, size_bytes, uploaded_at, uploaded_by_user_id"
    )
    .eq("board_id", boardId)
    .eq("card_id", cardId)
    .eq("field_definition_id", fieldDefinitionId)
    .eq("status", "ready")
    .order("uploaded_at", { ascending: true });

  if (attError) {
    console.error("listReadyCardAttachmentsForViewer attachments:", attError.message);
    return { ok: false, message: "Не удалось загрузить список вложений." };
  }

  const attachments: CardAttachmentReadyListItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    field_definition_id: String(r.field_definition_id ?? fieldDefinitionId),
    original_file_name: r.original_file_name,
    mime_type: r.mime_type,
    size_bytes: r.size_bytes,
    uploaded_at: r.uploaded_at,
    uploaded_by_user_id: r.uploaded_by_user_id
  }));

  return { ok: true, attachments };
}

/**
 * Все вложения карточки по статусам. Только `getSupabaseServiceRoleClient()` и доверенный код (YDB9 cleanup).
 * Не проверяет права пользователя — вызыватель обязан ограничить доступ.
 */
export async function listCardAttachmentsAllStatusesForServiceRole(
  admin: SupabaseClient,
  boardId: string,
  cardId: string
): Promise<ListCardAttachmentsAllStatusesResult> {
  const b = normalizeUuidParam(boardId);
  const c = normalizeUuidParam(cardId);
  if (!b || !c) {
    return { ok: false, message: "Некорректный идентификатор доски или карточки." };
  }

  const { data: cardRow, error: cardError } = await admin
    .from("cards")
    .select("id")
    .eq("id", c)
    .eq("board_id", b)
    .maybeSingle();

  if (cardError) {
    console.error("listCardAttachmentsAllStatusesForServiceRole cards read:", cardError.message);
    return { ok: false, message: "Не удалось проверить карточку." };
  }
  if (!cardRow) {
    return { ok: false, message: "Карточка не найдена на этой доске." };
  }

  const { data: rows, error: attError } = await admin
    .from("card_attachments")
    .select("*")
    .eq("board_id", b)
    .eq("card_id", c)
    .order("uploaded_at", { ascending: true });

  if (attError) {
    console.error(
      "listCardAttachmentsAllStatusesForServiceRole attachments:",
      attError.message
    );
    return { ok: false, message: "Не удалось загрузить вложения." };
  }

  const attachments = (rows ?? []) as CardAttachmentAllStatusesRow[];
  return { ok: true, attachments };
}
