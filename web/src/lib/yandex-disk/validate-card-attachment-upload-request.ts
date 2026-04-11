import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeUuidParam } from "@/lib/board-id-param";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { assertCardYandexDiskFieldDefinition } from "./assert-card-yandex-disk-field-definition";
import { requireActiveBoardYandexDiskIntegration } from "./require-active-board-yandex-disk-integration";
import {
  YANDEX_DISK_MSG_AUTH_REQUIRED,
  YANDEX_DISK_MSG_CARD_ATTACHMENT_LIMIT,
  YANDEX_DISK_MSG_FILE_EMPTY,
  YANDEX_DISK_MSG_FILE_TOO_LARGE,
  YANDEX_DISK_MSG_NO_UPLOAD_PERMISSION,
  YANDEX_DISK_MSG_TOO_MANY_FILES_IN_BATCH
} from "./yandex-disk-product-messages";

/** Спецификация 10.2 */
export const CARD_ATTACHMENT_UPLOAD_MAX_FILES_PER_OPERATION = 20;
export const CARD_ATTACHMENT_UPLOAD_MAX_READY_PER_CARD = 200;
/** Максимальный размер одного файла (1 ГиБ). Должен совпадать с текстом `YANDEX_DISK_MSG_FILE_TOO_LARGE`. */
export const CARD_ATTACHMENT_UPLOAD_MAX_FILE_BYTES = 1024 * 1024 * 1024;

export type CardAttachmentUploadFileMeta = {
  name: string;
  size: number;
};

export type ValidateCardAttachmentUploadRequestInput = {
  boardId: string;
  cardId: string;
  /** Поле доски типа `yandex_disk` на этой доске (YDB4.7). */
  fieldDefinitionId: string;
  files: CardAttachmentUploadFileMeta[];
};

export type ValidateCardAttachmentUploadRequestResult =
  | { ok: true }
  | { ok: false; message: string };

function invalidIdsResult(): ValidateCardAttachmentUploadRequestResult {
  return { ok: false, message: "Некорректный идентификатор доски, карточки или поля." };
}

/**
 * Пункты 1–2 сценария спец. 10.4 и ограничения 10.2 (до создания строки `uploading` и вызовов API Диска).
 * Вызывать из server action / route handler после извлечения `File` из FormData.
 */
export async function validateCardAttachmentUploadRequest(
  supabase: SupabaseClient,
  input: ValidateCardAttachmentUploadRequestInput
): Promise<ValidateCardAttachmentUploadRequestResult> {
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

  const files = input.files ?? [];
  if (files.length === 0) {
    return { ok: false, message: "Выберите хотя бы один файл." };
  }
  if (files.length > CARD_ATTACHMENT_UPLOAD_MAX_FILES_PER_OPERATION) {
    return { ok: false, message: YANDEX_DISK_MSG_TOO_MANY_FILES_IN_BATCH };
  }

  for (const f of files) {
    if (f.size <= 0) {
      return { ok: false, message: YANDEX_DISK_MSG_FILE_EMPTY };
    }
    if (f.size > CARD_ATTACHMENT_UPLOAD_MAX_FILE_BYTES) {
      return { ok: false, message: YANDEX_DISK_MSG_FILE_TOO_LARGE };
    }
  }

  const fieldOk = await assertCardYandexDiskFieldDefinition(supabase, {
    boardId,
    cardId,
    fieldDefinitionId
  });
  if (!fieldOk.ok) {
    return fieldOk;
  }

  const { data: canEdit, error: editRpcError } = await supabase.rpc("can_edit_card_content", {
    p_card_id: cardId
  });

  if (editRpcError) {
    console.error(
      "validateCardAttachmentUploadRequest can_edit_card_content:",
      editRpcError.message
    );
    return { ok: false, message: "Не удалось проверить права на карточку." };
  }
  if (canEdit !== true) {
    return { ok: false, message: YANDEX_DISK_MSG_NO_UPLOAD_PERMISSION };
  }

  const integ = await requireActiveBoardYandexDiskIntegration(boardId);
  if (!integ.ok) {
    return { ok: false, message: integ.message };
  }

  const admin = getSupabaseServiceRoleClient();
  const { count, error: countError } = await admin
    .from("card_attachments")
    .select("*", { count: "exact", head: true })
    .eq("card_id", cardId)
    .eq("board_id", boardId)
    .eq("field_definition_id", fieldDefinitionId)
    .eq("status", "ready");

  if (countError) {
    console.error("validateCardAttachmentUploadRequest ready count:", countError.message);
    return { ok: false, message: "Не удалось проверить лимит вложений." };
  }
  const ready = count ?? 0;
  if (ready + files.length > CARD_ATTACHMENT_UPLOAD_MAX_READY_PER_CARD) {
    return { ok: false, message: YANDEX_DISK_MSG_CARD_ATTACHMENT_LIMIT };
  }

  return { ok: true };
}

export function filesToAttachmentUploadMetaList(files: File[]): CardAttachmentUploadFileMeta[] {
  return files.map((f) => ({ name: f.name, size: f.size }));
}
