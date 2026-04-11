import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeUuidParam } from "@/lib/board-id-param";

import { ensureBoardYandexDiskAccessToken } from "./board-yandex-disk-access-token";
import { requireActiveBoardYandexDiskIntegration } from "./require-active-board-yandex-disk-integration";
import { diskDeleteResource, YandexDiskClientError } from "./yandex-disk-client";
import {
  mapYandexDiskClientErrorToProductMessage,
  YANDEX_DISK_MSG_AUTH_REQUIRED,
  YANDEX_DISK_MSG_DELETE_FAILED,
  YANDEX_DISK_MSG_NO_DELETE_PERMISSION
} from "./yandex-disk-product-messages";

export type DeleteCardAttachmentResult = { ok: true } | { ok: false; message: string };

function invalidIdsResult(): DeleteCardAttachmentResult {
  return { ok: false, message: "Некорректный идентификатор." };
}

/**
 * YDB5.4 / YDB5.6 / спец. 12.2–12.3: право редактирования содержимого карточки, затем удаление на Диске,
 * затем строка в БД. Отсутствие файла у провайдера (`not_found`) — успешная очистка, запись всё равно удаляется.
 * `fieldDefinitionId` обязателен: удаление только если вложение привязано к этому полю `Яндекс диск`.
 */
export async function deleteCardAttachment(
  supabase: SupabaseClient,
  input: { boardId: string; cardId: string; attachmentId: string; fieldDefinitionId: string }
): Promise<DeleteCardAttachmentResult> {
  const boardId = normalizeUuidParam(input.boardId);
  const cardId = normalizeUuidParam(input.cardId);
  const attachmentId = normalizeUuidParam(input.attachmentId);
  const fieldDefinitionId = normalizeUuidParam(input.fieldDefinitionId);
  if (!boardId || !cardId || !attachmentId || !fieldDefinitionId) {
    return invalidIdsResult();
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, message: YANDEX_DISK_MSG_AUTH_REQUIRED };
  }

  const { data: canEdit, error: editRpcError } = await supabase.rpc("can_edit_card_content", {
    p_card_id: cardId
  });
  if (editRpcError) {
    console.error("deleteCardAttachment can_edit_card_content:", editRpcError.message);
    return { ok: false, message: "Не удалось проверить право на удаление." };
  }
  if (!canEdit) {
    return { ok: false, message: YANDEX_DISK_MSG_NO_DELETE_PERMISSION };
  }

  const { data: row, error: rowError } = await supabase
    .from("card_attachments")
    .select("id, storage_path, status")
    .eq("id", attachmentId)
    .eq("board_id", boardId)
    .eq("card_id", cardId)
    .eq("field_definition_id", fieldDefinitionId)
    .eq("status", "ready")
    .maybeSingle();

  if (rowError) {
    console.error("deleteCardAttachment select:", rowError.message);
    return { ok: false, message: "Не удалось проверить вложение." };
  }
  if (!row?.id) {
    return { ok: false, message: "Вложение не найдено." };
  }

  const integ = await requireActiveBoardYandexDiskIntegration(boardId);
  if (!integ.ok) {
    return { ok: false, message: integ.message };
  }

  const tokenResult = await ensureBoardYandexDiskAccessToken(boardId);
  if (!tokenResult.ok) {
    const statusKind = tokenResult.kind === "refresh_transient" ? "transient" : "auth";
    if (statusKind === "transient") {
      return { ok: false, message: tokenResult.message };
    }
    return { ok: false, message: tokenResult.message };
  }

  const path = typeof row.storage_path === "string" ? row.storage_path.trim() : "";
  if (path) {
    try {
      await diskDeleteResource(tokenResult.accessToken, path);
    } catch (e) {
      if (e instanceof YandexDiskClientError) {
        const mapped = mapYandexDiskClientErrorToProductMessage(e, "delete");
        if (mapped !== null) {
          return { ok: false, message: mapped };
        }
        // `not_found` → спец. 12.3: считаем успехом, удаляем строку в БД
      } else {
        console.error("deleteCardAttachment diskDeleteResource", e);
        return { ok: false, message: YANDEX_DISK_MSG_DELETE_FAILED };
      }
    }
  }

  const { error: delError } = await supabase
    .from("card_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("board_id", boardId)
    .eq("card_id", cardId)
    .eq("field_definition_id", fieldDefinitionId);

  if (delError) {
    console.error("deleteCardAttachment delete:", delError.message);
    return { ok: false, message: "Не удалось удалить запись вложения." };
  }

  return { ok: true };
}
