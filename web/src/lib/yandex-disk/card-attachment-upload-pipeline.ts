import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeUuidParam } from "@/lib/board-id-param";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { ensureBoardYandexDiskAccessToken } from "./board-yandex-disk-access-token";
import {
  diskResourceExists,
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
import { validateCardAttachmentUploadRequest } from "./validate-card-attachment-upload-request";

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

async function updateAttachmentStatus(
  attachmentId: string,
  status: "ready" | "failed"
): Promise<boolean> {
  const admin = getSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("card_attachments")
    .update({ status })
    .eq("id", attachmentId)
    .select("id")
    .maybeSingle();
  if (error || !data?.id) {
    console.error(`card_attachments update ${status}:`, error?.message ?? "row not updated", attachmentId);
    return false;
  }
  return true;
}

async function markAttachmentFailed(attachmentId: string): Promise<void> {
  await updateAttachmentStatus(attachmentId, "failed");
}

async function waitForUploadedObjectToAppear(
  accessToken: string,
  storagePath: string
): Promise<boolean> {
  // `202 Accepted` у Яндекса означает, что файл уже принят uploader-ом, но ещё переносится в Диск.
  // Даём провайдеру короткое окно стабилизации, чтобы не оставлять успешные загрузки в `uploading`.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    try {
      if (await diskResourceExists(accessToken, storagePath)) {
        return true;
      }
    } catch (e) {
      if (!(e instanceof YandexDiskClientError) || e.code !== "network_error") {
        throw e;
      }
    }
  }
  return false;
}

export type UploadOneCardAttachmentFileResult =
  | { ok: true }
  | { ok: false; message: string };

export type CompleteOneCardAttachmentUploadResult =
  | { ok: true }
  | { ok: false; message: string; retryable?: boolean };

export type FailOneCardAttachmentUploadResult = { ok: true } | { ok: false; message: string };

export type PreparedCardAttachmentUpload = {
  attachmentId: string;
  uploadUrl: string;
  uploadMethod: string;
  storagePath: string;
  mimeType: string;
};

type PrepareCardAttachmentUploadFileInput = {
  name: string;
  size: number;
  type?: string | null;
};

/**
 * Короткий server-side шаг direct upload (YDB4.8): после валидации и ensure папки
 * создаёт строку `uploading` и получает краткоживущий upload URL у Яндекс.Диска.
 */
export async function prepareOneCardAttachmentUpload(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  cardId: string,
  fieldDefinitionId: string,
  file: PrepareCardAttachmentUploadFileInput
): Promise<{ ok: true; prepared: PreparedCardAttachmentUpload } | { ok: false; message: string }> {
  const b = normalizeUuidParam(boardId);
  const c = normalizeUuidParam(cardId);
  const f = normalizeUuidParam(fieldDefinitionId);
  if (!b || !c || !f) {
    return { ok: false, message: "Некорректный идентификатор доски, карточки или поля." };
  }

  const attachmentId = crypto.randomUUID();
  const suffix = yandexDiskAttachmentFileSuffix(file.name);
  const storagePath = yandexDiskCardAttachmentObjectPath(b, c, attachmentId, suffix);
  const mimeType = file.type?.trim() ? file.type.trim() : "application/octet-stream";

  const { error: insertError } = await supabase.from("card_attachments").insert({
    id: attachmentId,
    board_id: b,
    card_id: c,
    field_definition_id: f,
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
    await markAttachmentFailed(attachmentId);
    return { ok: false, message: tokenResult.message };
  }

  try {
    const { href, method } = await diskGetUploadLink(tokenResult.accessToken, storagePath);
    return {
      ok: true,
      prepared: {
        attachmentId,
        uploadUrl: href,
        uploadMethod: method,
        storagePath,
        mimeType
      }
    };
  } catch (e) {
    if (e instanceof YandexDiskClientError) {
      const mapped =
        mapYandexDiskClientErrorToProductMessage(e, "upload") ?? YANDEX_DISK_MSG_UPLOAD_FAILED;
      console.error("card attachment prepare upload:", e.code, e.rawProviderMessage ?? e.message);
      await markAttachmentFailed(attachmentId);
      return { ok: false, message: mapped };
    }
    console.error("card attachment prepare upload:", e);
    await markAttachmentFailed(attachmentId);
    return { ok: false, message: YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE };
  }
}

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
  fieldDefinitionId: string,
  file: File
): Promise<UploadOneCardAttachmentFileResult> {
  const b = normalizeUuidParam(boardId);
  if (!b) {
    return { ok: false, message: "Некорректный идентификатор доски, карточки или поля." };
  }

  const prepared = await prepareOneCardAttachmentUpload(
    supabase,
    userId,
    boardId,
    cardId,
    fieldDefinitionId,
    {
      name: file.name,
      size: file.size,
      type: file.type
    }
  );
  if (!prepared.ok) {
    return prepared;
  }

  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const uploadResult = await diskPutUpload(prepared.prepared.uploadUrl, buf, {
      contentType:
        prepared.prepared.mimeType !== "application/octet-stream" ?
          prepared.prepared.mimeType
        : undefined
    });
    if (uploadResult.acceptedAsync) {
      const tokenResult = await ensureBoardYandexDiskAccessToken(b);
      if (!tokenResult.ok) {
        await markAttachmentFailed(prepared.prepared.attachmentId);
        return { ok: false, message: tokenResult.message };
      }
      await waitForUploadedObjectToAppear(tokenResult.accessToken, prepared.prepared.storagePath);
    }
  } catch (e) {
    if (e instanceof YandexDiskClientError && e.code === "network_error") {
      try {
        const tokenResult = await ensureBoardYandexDiskAccessToken(b);
        if (!tokenResult.ok) {
          await markAttachmentFailed(prepared.prepared.attachmentId);
          return { ok: false, message: tokenResult.message };
        }
        if (
          await waitForUploadedObjectToAppear(
            tokenResult.accessToken,
            prepared.prepared.storagePath
          )
        ) {
          console.warn(
            "card attachment upload recovered after network_error:",
            prepared.prepared.attachmentId
          );
        } else {
          throw e;
        }
      } catch (recoveryError) {
        if (!(recoveryError instanceof YandexDiskClientError) || recoveryError.code !== "network_error") {
          console.error("card attachment upload recovery:", recoveryError);
        }
        console.error("card attachment disk upload:", e.code, e.rawProviderMessage ?? e.message);
        await markAttachmentFailed(prepared.prepared.attachmentId);
        return { ok: false, message: YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE };
      }
    } else if (e instanceof YandexDiskClientError) {
      const mapped =
        mapYandexDiskClientErrorToProductMessage(e, "upload") ?? YANDEX_DISK_MSG_UPLOAD_FAILED;
      console.error("card attachment disk upload:", e.code, e.rawProviderMessage ?? e.message);
      await markAttachmentFailed(prepared.prepared.attachmentId);
      return { ok: false, message: mapped };
    } else {
      console.error("card attachment disk upload:", e);
      await markAttachmentFailed(prepared.prepared.attachmentId);
      return { ok: false, message: YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE };
    }
  }

  const readyUpdated = await updateAttachmentStatus(prepared.prepared.attachmentId, "ready");
  if (!readyUpdated) {
    await markAttachmentFailed(prepared.prepared.attachmentId);
    return { ok: false, message: "Не удалось завершить сохранение вложения." };
  }

  return { ok: true };
}

type UploadingAttachmentRow = {
  id: string;
  board_id: string;
  card_id: string;
  field_definition_id: string;
  status: "uploading" | "ready" | "failed";
  storage_path: string;
  original_file_name: string;
  size_bytes: number;
  uploaded_by_user_id: string;
};

/**
 * Server-side завершение direct upload (YDB4.9).
 * Клиент передаёт только идентификаторы; факт наличия файла проверяется на Диске.
 */
export async function completeOneCardAttachmentUpload(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  cardId: string,
  fieldDefinitionId: string,
  attachmentId: string
): Promise<CompleteOneCardAttachmentUploadResult> {
  const b = normalizeUuidParam(boardId);
  const c = normalizeUuidParam(cardId);
  const f = normalizeUuidParam(fieldDefinitionId);
  const a = normalizeUuidParam(attachmentId);
  if (!b || !c || !f || !a) {
    return { ok: false, message: "Некорректный идентификатор доски, карточки, поля или вложения." };
  }

  const admin = getSupabaseServiceRoleClient();
  const { data: row, error: rowError } = await admin
    .from("card_attachments")
    .select(
      "id, board_id, card_id, field_definition_id, status, storage_path, original_file_name, size_bytes, uploaded_by_user_id"
    )
    .eq("id", a)
    .eq("board_id", b)
    .eq("card_id", c)
    .eq("field_definition_id", f)
    .maybeSingle<UploadingAttachmentRow>();

  if (rowError) {
    console.error("completeOneCardAttachmentUpload attachment read:", rowError.message);
    return { ok: false, message: "Не удалось проверить вложение." };
  }
  if (!row) {
    return { ok: false, message: "Вложение не найдено." };
  }
  if (row.uploaded_by_user_id !== userId) {
    return { ok: false, message: "Нет прав завершить загрузку этого вложения." };
  }
  if (row.status === "ready") {
    return { ok: true };
  }
  if (row.status === "failed") {
    return { ok: false, message: "Загрузка этого файла завершилась с ошибкой." };
  }

  // Повторно проверяем права и активность интеграции (без доверия клиенту).
  const validated = await validateCardAttachmentUploadRequest(supabase, {
    boardId: b,
    cardId: c,
    fieldDefinitionId: f,
    files: [{ name: row.original_file_name, size: row.size_bytes }]
  });
  if (!validated.ok) {
    return validated;
  }

  const tokenResult = await ensureBoardYandexDiskAccessToken(b);
  if (!tokenResult.ok) {
    return { ok: false, message: tokenResult.message };
  }

  try {
    const appeared = await waitForUploadedObjectToAppear(tokenResult.accessToken, row.storage_path);
    if (!appeared) {
      return {
        ok: false,
        retryable: true,
        message: "Файл ещё обрабатывается Яндекс.Диском. Подождите немного и повторите."
      };
    }
  } catch (e) {
    if (e instanceof YandexDiskClientError) {
      console.error(
        "completeOneCardAttachmentUpload exists check:",
        e.code,
        e.rawProviderMessage ?? e.message
      );
      return { ok: false, message: YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE, retryable: true };
    }
    console.error("completeOneCardAttachmentUpload exists check:", e);
    return { ok: false, message: YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE, retryable: true };
  }

  const readyUpdated = await updateAttachmentStatus(a, "ready");
  if (!readyUpdated) {
    await markAttachmentFailed(a);
    return { ok: false, message: "Не удалось завершить сохранение вложения." };
  }

  return { ok: true };
}

/**
 * Best-effort пометка `uploading -> failed`, если direct upload оборвался на клиенте.
 * Важно: доступ только uploader'у конкретного вложения.
 */
export async function failOneCardAttachmentUpload(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  cardId: string,
  fieldDefinitionId: string,
  attachmentId: string
): Promise<FailOneCardAttachmentUploadResult> {
  const b = normalizeUuidParam(boardId);
  const c = normalizeUuidParam(cardId);
  const f = normalizeUuidParam(fieldDefinitionId);
  const a = normalizeUuidParam(attachmentId);
  if (!b || !c || !f || !a) {
    return { ok: false, message: "Некорректный идентификатор доски, карточки, поля или вложения." };
  }

  // Подтверждаем, что пользователь всё ещё может редактировать карточку и поле валидно.
  const validated = await validateCardAttachmentUploadRequest(supabase, {
    boardId: b,
    cardId: c,
    fieldDefinitionId: f,
    files: [{ name: "x", size: 1 }]
  });
  if (!validated.ok) {
    return validated;
  }

  const admin = getSupabaseServiceRoleClient();
  const { data: row, error: rowError } = await admin
    .from("card_attachments")
    .select("id, status, uploaded_by_user_id")
    .eq("id", a)
    .eq("board_id", b)
    .eq("card_id", c)
    .eq("field_definition_id", f)
    .maybeSingle<{ id: string; status: "uploading" | "ready" | "failed"; uploaded_by_user_id: string }>();

  if (rowError) {
    console.error("failOneCardAttachmentUpload attachment read:", rowError.message);
    return { ok: false, message: "Не удалось проверить вложение." };
  }
  if (!row) {
    return { ok: true };
  }
  if (row.uploaded_by_user_id !== userId) {
    return { ok: false, message: "Нет прав завершить загрузку этого вложения." };
  }
  if (row.status !== "uploading") {
    return { ok: true };
  }

  const updated = await updateAttachmentStatus(a, "failed");
  if (!updated) {
    return { ok: false, message: "Не удалось завершить сохранение вложения." };
  }

  return { ok: true };
}
