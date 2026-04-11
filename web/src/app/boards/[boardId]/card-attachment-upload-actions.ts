"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadOneCardAttachmentFile } from "@/lib/yandex-disk/card-attachment-upload-pipeline";
import { ensureYandexDiskCardAttachmentFolder } from "@/lib/yandex-disk/ensure-yandex-disk-card-attachment-folder";
import { YANDEX_DISK_MSG_AUTH_REQUIRED } from "@/lib/yandex-disk/yandex-disk-product-messages";
import {
  filesToAttachmentUploadMetaList,
  validateCardAttachmentUploadRequest,
  type ValidateCardAttachmentUploadRequestResult
} from "@/lib/yandex-disk/validate-card-attachment-upload-request";

/** Итог по одному файлу в batch (YDB4.5): успех или отдельное продуктовое сообщение об ошибке. */
export type CardAttachmentUploadFileItemResult =
  | { originalName: string; ok: true }
  | { originalName: string; ok: false; message: string };

/**
 * Результат `cardAttachmentUploadAction`.
 * - `ok: false` — не дошли до загрузки (валидация, папка на Диске, сессия).
 * - `ok: true` — batch обработан по файлам; возможен частичный успех (YDB4.5): смотреть `files[].ok`.
 * Успешные файлы остаются в БД со статусом `ready`, проваленные — `failed`; отката успешных из‑за соседних ошибок нет.
 */
export type CardAttachmentUploadActionResult =
  | { ok: false; message: string }
  | { ok: true; files: CardAttachmentUploadFileItemResult[] };

export type CardAttachmentUploadPrecheckResult = ValidateCardAttachmentUploadRequestResult;

/** YDB4.1–4.3: валидация и папка на Диске без создания строк и PUT (вспомогательно). */
export async function cardAttachmentUploadPrecheckAction(
  boardId: string,
  cardId: string,
  formData: FormData
): Promise<CardAttachmentUploadPrecheckResult> {
  const supabase = await createSupabaseServerClient();
  const raw = formData.getAll("files");
  const files = raw.filter((x): x is File => x instanceof File);
  const validated = await validateCardAttachmentUploadRequest(supabase, {
    boardId,
    cardId,
    files: filesToAttachmentUploadMetaList(files)
  });
  if (!validated.ok) {
    return validated;
  }

  const folder = await ensureYandexDiskCardAttachmentFolder(boardId, cardId);
  if (!folder.ok) {
    return { ok: false, message: folder.message };
  }

  return { ok: true };
}

/**
 * Загрузка вложений карточки (YDB4.4 + YDB4.5): спец. 10.4 — по файлу после общих проверок.
 * Batch без сквозной транзакции: ошибка по одному файлу не откатывает уже принятые `ready`.
 * FormData: поле `files` — один или несколько `File` (`input name="files" multiple`).
 */
export async function cardAttachmentUploadAction(
  boardId: string,
  cardId: string,
  formData: FormData
): Promise<CardAttachmentUploadActionResult> {
  const supabase = await createSupabaseServerClient();
  const raw = formData.getAll("files");
  const files = raw.filter((x): x is File => x instanceof File);

  const validated = await validateCardAttachmentUploadRequest(supabase, {
    boardId,
    cardId,
    files: filesToAttachmentUploadMetaList(files)
  });
  if (!validated.ok) {
    return validated;
  }

  const folder = await ensureYandexDiskCardAttachmentFolder(boardId, cardId);
  if (!folder.ok) {
    return { ok: false, message: folder.message };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, message: YANDEX_DISK_MSG_AUTH_REQUIRED };
  }

  const userId = userData.user.id;
  const results: CardAttachmentUploadFileItemResult[] = [];

  // Каждый файл — отдельная цепочка БД/Диска; частичный успех (YDB4.5).
  for (const file of files) {
    const one = await uploadOneCardAttachmentFile(supabase, userId, boardId, cardId, file);
    if (one.ok) {
      results.push({ originalName: file.name, ok: true });
    } else {
      results.push({ originalName: file.name, ok: false, message: one.message });
    }
  }

  if (results.some((r) => r.ok)) {
    revalidatePath(`/boards/${boardId}`);
  }

  return { ok: true, files: results };
}
