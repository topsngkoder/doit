import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeUuidParam } from "@/lib/board-id-param";

import { YANDEX_DISK_MSG_INVALID_YANDEX_DISK_FIELD } from "./yandex-disk-product-messages";

export type AssertCardYandexDiskFieldDefinitionResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Карточка на доске + определение поля этой доски с типом `yandex_disk` (спец. YDB4.7).
 * Без проверки прав редактирования — её добавляет вызывающий для upload.
 */
export async function assertCardYandexDiskFieldDefinition(
  supabase: SupabaseClient,
  input: { boardId: string; cardId: string; fieldDefinitionId: string }
): Promise<AssertCardYandexDiskFieldDefinitionResult> {
  const boardId = normalizeUuidParam(input.boardId);
  const cardId = normalizeUuidParam(input.cardId);
  const fieldDefinitionId = normalizeUuidParam(input.fieldDefinitionId);
  if (!boardId || !cardId || !fieldDefinitionId) {
    return { ok: false, message: "Некорректный идентификатор доски, карточки или поля." };
  }

  const { data: cardRow, error: cardError } = await supabase
    .from("cards")
    .select("id, board_id")
    .eq("id", cardId)
    .maybeSingle();

  if (cardError) {
    console.error("assertCardYandexDiskFieldDefinition cards read:", cardError.message);
    return { ok: false, message: "Не удалось проверить карточку." };
  }
  if (!cardRow || cardRow.board_id !== boardId) {
    return { ok: false, message: "Карточка не найдена на этой доске." };
  }

  const { data: defRow, error: defError } = await supabase
    .from("board_field_definitions")
    .select("id, board_id, field_type")
    .eq("id", fieldDefinitionId)
    .maybeSingle();

  if (defError) {
    console.error("assertCardYandexDiskFieldDefinition definitions read:", defError.message);
    return { ok: false, message: "Не удалось проверить поле доски." };
  }
  if (!defRow || defRow.board_id !== boardId || defRow.field_type !== "yandex_disk") {
    return { ok: false, message: YANDEX_DISK_MSG_INVALID_YANDEX_DISK_FIELD };
  }

  return { ok: true };
}
