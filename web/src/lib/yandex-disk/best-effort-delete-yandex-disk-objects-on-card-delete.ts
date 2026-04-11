import "server-only";

import { normalizeUuidParam } from "@/lib/board-id-param";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { ensureBoardYandexDiskAccessToken } from "./board-yandex-disk-access-token";
import { listCardAttachmentsAllStatusesForServiceRole } from "./list-card-attachments";
import { diskDeleteResource, YandexDiskClientError } from "./yandex-disk-client";
import { mapYandexDiskClientErrorToProductMessage } from "./yandex-disk-product-messages";

/**
 * YDB5.5 / спец. 12.4: перед удалением строки карточки (и каскадом `card_attachments`)
 * пытаемся удалить объекты на Яндекс.Диске. Сбои API и отсутствие токена не блокируют удаление карточки;
 * `not_found` у провайдера — норма.
 */
export async function bestEffortDeleteYandexDiskObjectsForCard(
  boardId: string,
  cardId: string
): Promise<void> {
  const b = normalizeUuidParam(boardId);
  const c = normalizeUuidParam(cardId);
  if (!b || !c) return;

  const admin = getSupabaseServiceRoleClient();
  const listed = await listCardAttachmentsAllStatusesForServiceRole(admin, b, c);
  if (!listed.ok) {
    console.warn(
      "bestEffortDeleteYandexDiskObjectsForCard: не удалось прочитать вложения для очистки Диска:",
      listed.message,
      { boardId: b, cardId: c }
    );
    return;
  }

  const paths = new Set<string>();
  for (const row of listed.attachments) {
    if (row.storage_provider !== "yandex_disk") continue;
    const p = typeof row.storage_path === "string" ? row.storage_path.trim() : "";
    if (p) paths.add(p);
  }
  if (paths.size === 0) return;

  const tokenResult = await ensureBoardYandexDiskAccessToken(b);
  if (!tokenResult.ok) {
    console.warn(
      "bestEffortDeleteYandexDiskObjectsForCard: пропуск удаления на Диске (нет действующего токена):",
      tokenResult.message,
      { boardId: b, cardId: c, pathCount: paths.size }
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
          "bestEffortDeleteYandexDiskObjectsForCard: ошибка удаления на Диске:",
          e.code,
          mapped ?? e.message,
          path
        );
        continue;
      }
      console.warn("bestEffortDeleteYandexDiskObjectsForCard: непредвиденная ошибка:", e, path);
    }
  }
}
