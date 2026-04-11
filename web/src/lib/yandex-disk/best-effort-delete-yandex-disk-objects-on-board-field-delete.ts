import "server-only";

import { normalizeUuidParam } from "@/lib/board-id-param";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { ensureBoardYandexDiskAccessToken } from "./board-yandex-disk-access-token";
import { diskDeleteResource, YandexDiskClientError } from "./yandex-disk-client";
import { mapYandexDiskClientErrorToProductMessage } from "./yandex-disk-product-messages";

/**
 * Перед удалением определения поля типа `yandex_disk` (и каскадом `card_attachments`)
 * пытаемся удалить объекты на Яндекс.Диске по всем карточкам доски для этого поля.
 * Аналог YDB5.5 для сценария «несколько файловых полей на доске» (YDB7.4).
 */
export async function bestEffortDeleteYandexDiskObjectsForBoardFieldDefinition(
  boardId: string,
  fieldDefinitionId: string
): Promise<void> {
  const b = normalizeUuidParam(boardId);
  const f = normalizeUuidParam(fieldDefinitionId);
  if (!b || !f) return;

  const admin = getSupabaseServiceRoleClient();
  const { data: rows, error: attError } = await admin
    .from("card_attachments")
    .select("storage_provider, storage_path")
    .eq("board_id", b)
    .eq("field_definition_id", f);

  if (attError) {
    console.warn(
      "bestEffortDeleteYandexDiskObjectsForBoardFieldDefinition: не удалось прочитать вложения:",
      attError.message,
      { boardId: b, fieldDefinitionId: f }
    );
    return;
  }

  const paths = new Set<string>();
  for (const row of rows ?? []) {
    if (row.storage_provider !== "yandex_disk") continue;
    const p = typeof row.storage_path === "string" ? row.storage_path.trim() : "";
    if (p) paths.add(p);
  }
  if (paths.size === 0) return;

  const tokenResult = await ensureBoardYandexDiskAccessToken(b);
  if (!tokenResult.ok) {
    console.warn(
      "bestEffortDeleteYandexDiskObjectsForBoardFieldDefinition: пропуск удаления на Диске:",
      tokenResult.message,
      { boardId: b, fieldDefinitionId: f, pathCount: paths.size }
    );
    return;
  }

  for (const path of paths) {
    try {
      await diskDeleteResource(tokenResult.accessToken, path);
    } catch (e) {
      if (e instanceof YandexDiskClientError) {
        if (e.code === "not_found") continue;
        const mapped = mapYandexDiskClientErrorToProductMessage(e, "delete");
        console.warn(
          "bestEffortDeleteYandexDiskObjectsForBoardFieldDefinition: ошибка удаления на Диске:",
          e.code,
          mapped ?? e.message,
          path
        );
        continue;
      }
      console.warn(
        "bestEffortDeleteYandexDiskObjectsForBoardFieldDefinition: непредвиденная ошибка:",
        e,
        path
      );
    }
  }
}
