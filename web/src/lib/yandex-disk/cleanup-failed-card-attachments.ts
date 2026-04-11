import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logYandexDiskCleanup } from "./yandex-disk-cleanup-logger";

/** Спец. SLA: failed-строки в БД не позднее 24 ч (YDB9.1). */
export const FAILED_CARD_ATTACHMENT_CLEANUP_MIN_AGE_HOURS_DEFAULT = 24;

export type CleanupFailedCardAttachmentsResult =
  | { ok: true; deletedCount: number }
  | { ok: false; message: string };

/**
 * Удаляет из `card_attachments` строки со `status = 'failed'`, у которых `uploaded_at` старше порога.
 * Только `getSupabaseServiceRoleClient()` — RPC не выдана `authenticated` (YDB9.1).
 */
export async function cleanupFailedCardAttachmentsOlderThan(
  admin: SupabaseClient,
  options?: { minAgeHours?: number }
): Promise<CleanupFailedCardAttachmentsResult> {
  const minAgeHours = options?.minAgeHours ?? FAILED_CARD_ATTACHMENT_CLEANUP_MIN_AGE_HOURS_DEFAULT;
  if (!Number.isFinite(minAgeHours) || minAgeHours < 1 || minAgeHours > 8760) {
    return { ok: false, message: "Некорректный интервал очистки (часы)." };
  }

  const { data, error } = await admin.rpc("cleanup_failed_card_attachments_older_than", {
    p_min_age_hours: Math.floor(minAgeHours)
  });

  if (error) {
    console.error("cleanup_failed_card_attachments_older_than:", error.message);
    logYandexDiskCleanup("error", "failed_attachments_rpc_error", {
      min_age_hours: Math.floor(minAgeHours),
      db_error: error.message
    });
    return { ok: false, message: "Не удалось выполнить очистку failed-вложений." };
  }

  const n =
    typeof data === "bigint"
      ? Number(data)
      : typeof data === "string"
        ? parseInt(data, 10)
        : Number(data);
  if (!Number.isFinite(n) || n < 0) {
    console.error("cleanup_failed_card_attachments_older_than: unexpected return", data);
    logYandexDiskCleanup("error", "failed_attachments_rpc_unexpected_payload", {
      min_age_hours: Math.floor(minAgeHours),
      payload_type: data === null ? "null" : typeof data
    });
    return { ok: false, message: "Неожиданный ответ очистки failed-вложений." };
  }

  return { ok: true, deletedCount: n };
}
