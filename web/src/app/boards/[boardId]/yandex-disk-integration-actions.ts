"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireBoardYandexDiskIntegrationManagement } from "@/lib/yandex-disk/board-yandex-disk-integration-access";
import {
  YANDEX_DISK_MSG_DISCONNECT_FAILED,
  YANDEX_DISK_MSG_INTEGRATION_OWNER_ONLY,
  YANDEX_DISK_MSG_NOT_CONNECTED
} from "@/lib/yandex-disk/yandex-disk-product-messages";

export type DisconnectBoardYandexDiskIntegrationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Отключение интеграции Яндекс.Диска для доски (YDB3.6): статус `disconnected`, токены сбрасываются;
 * файлы на Диске и записи `card_attachments` не удаляются.
 */
export async function disconnectBoardYandexDiskIntegrationAction(
  boardId: string
): Promise<DisconnectBoardYandexDiskIntegrationResult> {
  const supabase = await createSupabaseServerClient();

  const auth = await requireBoardYandexDiskIntegrationManagement(supabase, boardId);
  if (!auth.ok) {
    return { ok: false, message: auth.message };
  }

  const { data: code, error: rpcError } = await supabase.rpc("disconnect_board_yandex_disk_integration", {
    p_board_id: boardId
  });

  if (rpcError) {
    console.error("disconnect_board_yandex_disk_integration:", rpcError.message);
    return { ok: false, message: YANDEX_DISK_MSG_DISCONNECT_FAILED };
  }

  if (code === "forbidden") {
    return { ok: false, message: YANDEX_DISK_MSG_INTEGRATION_OWNER_ONLY };
  }
  if (code === "not_found") {
    return { ok: false, message: YANDEX_DISK_MSG_NOT_CONNECTED };
  }
  if (code !== "ok") {
    return { ok: false, message: YANDEX_DISK_MSG_DISCONNECT_FAILED };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}
