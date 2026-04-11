import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import {
  YANDEX_DISK_MSG_INTEGRATION_DISCONNECTED,
  YANDEX_DISK_MSG_NOT_CONNECTED,
  YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED
} from "./yandex-disk-product-messages";

/**
 * Загрузка и скачивание вложений допустимы только при `active` (спец. 10.x / доступность интеграции).
 */
export async function requireActiveBoardYandexDiskIntegration(
  boardId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = getSupabaseServiceRoleClient();
  const { data: integration, error: intError } = await admin
    .from("board_yandex_disk_integrations")
    .select("status")
    .eq("board_id", boardId)
    .maybeSingle();

  if (intError) {
    console.error("requireActiveBoardYandexDiskIntegration:", intError.message);
    return { ok: false, message: "Не удалось проверить интеграцию Яндекс.Диска." };
  }
  if (!integration) {
    return { ok: false, message: YANDEX_DISK_MSG_NOT_CONNECTED };
  }
  if (integration.status === "disconnected") {
    return { ok: false, message: YANDEX_DISK_MSG_INTEGRATION_DISCONNECTED };
  }
  if (integration.status !== "active") {
    return { ok: false, message: YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED };
  }
  return { ok: true };
}
