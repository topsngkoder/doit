import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { YANDEX_DISK_MSG_INTEGRATION_OWNER_ONLY } from "./yandex-disk-product-messages";

export type RequireBoardYandexDiskIntegrationManagementResult =
  | { ok: true; userId: string }
  | { ok: false; message: string };

/**
 * Проверка права управлять интеграцией Яндекс.Диска для доски.
 * Источник истины — `boards.owner_user_id`, без `has_board_permission` / ролей доски.
 * Совпадает с RLS `board_yandex_disk_integrations_*`: дополнительно пропускает системного администратора.
 */
export async function requireBoardYandexDiskIntegrationManagement(
  supabase: SupabaseClient,
  boardId: string
): Promise<RequireBoardYandexDiskIntegrationManagementResult> {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { data: allowed, error: rpcError } = await supabase.rpc("can_manage_board_yandex_disk_integration", {
    p_board_id: boardId
  });
  if (rpcError) {
    return { ok: false, message: rpcError.message };
  }
  if (allowed !== true) {
    return { ok: false, message: YANDEX_DISK_MSG_INTEGRATION_OWNER_ONLY };
  }

  return { ok: true, userId: user.id };
}
