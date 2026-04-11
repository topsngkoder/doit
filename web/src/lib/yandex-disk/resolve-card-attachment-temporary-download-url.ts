import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeUuidParam } from "@/lib/board-id-param";

import { ensureBoardYandexDiskAccessToken } from "./board-yandex-disk-access-token";
import { requireActiveBoardYandexDiskIntegration } from "./require-active-board-yandex-disk-integration";
import { diskGetDownloadLink, YandexDiskClientError } from "./yandex-disk-client";
import {
  mapYandexDiskClientErrorToProductMessage,
  YANDEX_DISK_MSG_AUTH_REQUIRED,
  YANDEX_DISK_MSG_DOWNLOAD_FAILED,
  YANDEX_DISK_MSG_FILE_NOT_FOUND_ON_DISK
} from "./yandex-disk-product-messages";

/** Спецификация 11.3: прикладной кэш временного URL не дольше этого интервала; предпочтительно 0 (не кэшировать между запросами). */
export const CARD_ATTACHMENT_DOWNLOAD_TEMPORARY_URL_MAX_APP_CACHE_SECONDS = 300;

export type ResolveCardAttachmentTemporaryDownloadUrlResult =
  | { ok: true; temporaryUrl: string }
  | { ok: false; httpStatus: number; message: string };

function invalidIdsResult(): ResolveCardAttachmentTemporaryDownloadUrlResult {
  return { ok: false, httpStatus: 400, message: "Некорректный идентификатор." };
}

/**
 * YDB5.1 / YDB5.2 / YDB5.3: на каждый вызов — новая временная ссылка у API Диска; URL не сохраняем в приложении.
 * Спец. 11.4: если строка `ready` есть, а файла на Диске нет (`not_found` от API) — ответ с
 * {@link YANDEX_DISK_MSG_FILE_NOT_FOUND_ON_DISK}, запись вложения в БД не изменяем и не удаляем.
 * Лимит прикладного кэша URL — {@link CARD_ATTACHMENT_DOWNLOAD_TEMPORARY_URL_MAX_APP_CACHE_SECONDS}.
 */
export async function resolveCardAttachmentTemporaryDownloadUrl(
  supabase: SupabaseClient,
  input: { boardId: string; cardId: string; attachmentId: string }
): Promise<ResolveCardAttachmentTemporaryDownloadUrlResult> {
  const boardId = normalizeUuidParam(input.boardId);
  const cardId = normalizeUuidParam(input.cardId);
  const attachmentId = normalizeUuidParam(input.attachmentId);
  if (!boardId || !cardId || !attachmentId) {
    return invalidIdsResult();
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, httpStatus: 401, message: YANDEX_DISK_MSG_AUTH_REQUIRED };
  }

  const { data: row, error: rowError } = await supabase
    .from("card_attachments")
    .select("id, storage_path")
    .eq("id", attachmentId)
    .eq("board_id", boardId)
    .eq("card_id", cardId)
    .eq("status", "ready")
    .maybeSingle();

  if (rowError) {
    console.error("resolveCardAttachmentTemporaryDownloadUrl select:", rowError.message);
    return { ok: false, httpStatus: 500, message: "Не удалось проверить вложение." };
  }
  if (!row?.storage_path) {
    return { ok: false, httpStatus: 404, message: "Вложение не найдено." };
  }

  const integ = await requireActiveBoardYandexDiskIntegration(boardId);
  if (!integ.ok) {
    return { ok: false, httpStatus: 403, message: integ.message };
  }

  const tokenResult = await ensureBoardYandexDiskAccessToken(boardId);
  if (!tokenResult.ok) {
    const status = tokenResult.kind === "refresh_transient" ? 503 : 403;
    return { ok: false, httpStatus: status, message: tokenResult.message };
  }

  try {
    const temporaryUrl = await diskGetDownloadLink(tokenResult.accessToken, row.storage_path);
    return { ok: true, temporaryUrl };
  } catch (e) {
    if (e instanceof YandexDiskClientError) {
      const msg =
        e.code === "not_found"
          ? YANDEX_DISK_MSG_FILE_NOT_FOUND_ON_DISK
          : (mapYandexDiskClientErrorToProductMessage(e, "download") ?? YANDEX_DISK_MSG_DOWNLOAD_FAILED);
      const httpStatus = e.code === "not_found" ? 404 : 502;
      return { ok: false, httpStatus, message: msg };
    }
    console.error("resolveCardAttachmentTemporaryDownloadUrl diskGetDownloadLink", e);
    return { ok: false, httpStatus: 502, message: YANDEX_DISK_MSG_DOWNLOAD_FAILED };
  }
}
