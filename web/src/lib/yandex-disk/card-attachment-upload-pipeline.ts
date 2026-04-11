import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeUuidParam } from "@/lib/board-id-param";

import { ensureBoardYandexDiskAccessToken } from "./board-yandex-disk-access-token";
import {
  diskGetUploadLink,
  diskPutUpload,
  YandexDiskClientError
} from "./yandex-disk-client";
import { yandexDiskCardAttachmentObjectPath } from "./yandex-disk-card-attachment-paths";
import {
  mapYandexDiskClientErrorToProductMessage,
  YANDEX_DISK_MSG_UPLOAD_FAILED,
  YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE
} from "./yandex-disk-product-messages";

const ORIGINAL_NAME_MAX_LEN = 512;

/**
 * Суффикс имени на Диске: безопасное расширение с точкой или `""` (спец.: не исходное имя файла).
 */
export function yandexDiskAttachmentFileSuffix(originalFileName: string): string {
  const name = originalFileName.trim();
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot >= name.length - 1) {
    return "";
  }
  const raw = name.slice(lastDot);
  if (!/^\.[A-Za-z0-9._-]{1,32}$/.test(raw)) {
    return "";
  }
  return raw.toLowerCase();
}

function truncateOriginalName(name: string): string {
  const t = name.trim();
  if (t.length <= ORIGINAL_NAME_MAX_LEN) return t;
  return t.slice(0, ORIGINAL_NAME_MAX_LEN);
}

async function markAttachmentFailed(supabase: SupabaseClient, attachmentId: string): Promise<void> {
  const { error } = await supabase
    .from("card_attachments")
    .update({ status: "failed" })
    .eq("id", attachmentId);
  if (error) {
    console.error("card_attachments mark failed:", error.message, attachmentId);
  }
}

export type UploadOneCardAttachmentFileResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Спец. 10.4 п. 3–6 для одного файла: строка `uploading` → upload URL → PUT → `ready`;
 * после п. 3 любая ошибка → `failed`.
 * Вызывать только после `validateCardAttachmentUploadRequest` и `ensureYandexDiskCardAttachmentFolder`.
 */
export async function uploadOneCardAttachmentFile(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  cardId: string,
  file: File
): Promise<UploadOneCardAttachmentFileResult> {
  const b = normalizeUuidParam(boardId);
  const c = normalizeUuidParam(cardId);
  if (!b || !c) {
    return { ok: false, message: "Некорректный идентификатор доски или карточки." };
  }

  const attachmentId = crypto.randomUUID();
  const suffix = yandexDiskAttachmentFileSuffix(file.name);
  const storagePath = yandexDiskCardAttachmentObjectPath(b, c, attachmentId, suffix);
  const mimeType = file.type?.trim() ? file.type.trim() : "application/octet-stream";

  const { error: insertError } = await supabase.from("card_attachments").insert({
    id: attachmentId,
    board_id: b,
    card_id: c,
    storage_provider: "yandex_disk",
    storage_path: storagePath,
    original_file_name: truncateOriginalName(file.name),
    mime_type: mimeType,
    size_bytes: file.size,
    uploaded_by_user_id: userId,
    status: "uploading"
  });

  if (insertError) {
    console.error("card_attachments insert uploading:", insertError.message);
    return { ok: false, message: "Не удалось создать запись вложения." };
  }

  const tokenResult = await ensureBoardYandexDiskAccessToken(b);
  if (!tokenResult.ok) {
    await markAttachmentFailed(supabase, attachmentId);
    return { ok: false, message: tokenResult.message };
  }

  try {
    const { href } = await diskGetUploadLink(tokenResult.accessToken, storagePath);
    const buf = new Uint8Array(await file.arrayBuffer());
    await diskPutUpload(href, buf, { contentType: mimeType !== "application/octet-stream" ? mimeType : undefined });
  } catch (e) {
    if (e instanceof YandexDiskClientError) {
      const mapped =
        mapYandexDiskClientErrorToProductMessage(e, "upload") ?? YANDEX_DISK_MSG_UPLOAD_FAILED;
      console.error("card attachment disk upload:", e.code, e.rawProviderMessage ?? e.message);
      await markAttachmentFailed(supabase, attachmentId);
      return { ok: false, message: mapped };
    }
    console.error("card attachment disk upload:", e);
    await markAttachmentFailed(supabase, attachmentId);
    return { ok: false, message: YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE };
  }

  const { error: readyError } = await supabase
    .from("card_attachments")
    .update({ status: "ready" })
    .eq("id", attachmentId);

  if (readyError) {
    console.error("card_attachments update ready:", readyError.message, attachmentId);
    await markAttachmentFailed(supabase, attachmentId);
    return { ok: false, message: "Не удалось завершить сохранение вложения." };
  }

  return { ok: true };
}
