"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureYandexDiskCardAttachmentFolder } from "@/lib/yandex-disk/ensure-yandex-disk-card-attachment-folder";
import {
  completeOneCardAttachmentUpload,
  prepareOneCardAttachmentUpload
} from "@/lib/yandex-disk/card-attachment-upload-pipeline";
import { runCardAttachmentUpload } from "@/lib/yandex-disk/card-attachment-upload-runner";
import type {
  CardAttachmentPrepareUploadResult,
  CardAttachmentCompleteUploadResult,
  CardAttachmentUploadActionResult,
  CardAttachmentUploadFileItemResult
} from "@/lib/yandex-disk/card-attachment-upload-result-types";
import { YANDEX_DISK_MSG_AUTH_REQUIRED } from "@/lib/yandex-disk/yandex-disk-product-messages";
import {
  filesToAttachmentUploadMetaList,
  validateCardAttachmentUploadRequest,
  type ValidateCardAttachmentUploadRequestResult
} from "@/lib/yandex-disk/validate-card-attachment-upload-request";

export type { CardAttachmentUploadActionResult, CardAttachmentUploadFileItemResult };

export type CardAttachmentUploadPrecheckResult = ValidateCardAttachmentUploadRequestResult;
export type { CardAttachmentPrepareUploadResult };
export type { CardAttachmentCompleteUploadResult };

/** YDB4.1–4.3: валидация и папка на Диске без создания строк и PUT (вспомогательно). */
export async function cardAttachmentUploadPrecheckAction(
  boardId: string,
  cardId: string,
  fieldDefinitionId: string,
  formData: FormData
): Promise<CardAttachmentUploadPrecheckResult> {
  const supabase = await createSupabaseServerClient();
  const raw = formData.getAll("files");
  const files = raw.filter((x): x is File => x instanceof File);
  const validated = await validateCardAttachmentUploadRequest(supabase, {
    boardId,
    cardId,
    fieldDefinitionId,
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
 * Короткий шаг direct upload (YDB4.8): проверка, ensure папки, создание `uploading` и выдача upload URL.
 * Байты файла через этот action не проходят.
 */
export async function cardAttachmentPrepareUploadAction(
  boardId: string,
  cardId: string,
  fieldDefinitionId: string,
  file: { name: string; size: number; type?: string | null }
): Promise<CardAttachmentPrepareUploadResult> {
  const supabase = await createSupabaseServerClient();

  const validated = await validateCardAttachmentUploadRequest(supabase, {
    boardId,
    cardId,
    fieldDefinitionId,
    files: [{ name: file.name, size: file.size }]
  });
  if (!validated.ok) {
    return validated;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, message: YANDEX_DISK_MSG_AUTH_REQUIRED };
  }

  const folder = await ensureYandexDiskCardAttachmentFolder(boardId, cardId);
  if (!folder.ok) {
    return { ok: false, message: folder.message };
  }

  const prepared = await prepareOneCardAttachmentUpload(
    supabase,
    userData.user.id,
    boardId,
    cardId,
    fieldDefinitionId,
    file
  );
  if (!prepared.ok) {
    return prepared;
  }

  return {
    ok: true,
    file: {
      attachmentId: prepared.prepared.attachmentId,
      uploadUrl: prepared.prepared.uploadUrl,
      uploadMethod: prepared.prepared.uploadMethod
    }
  };
}

/**
 * Короткий шаг завершения direct upload (YDB4.9): проверка факта появления файла на Диске и
 * переход `uploading -> ready`.
 */
export async function cardAttachmentCompleteUploadAction(
  boardId: string,
  cardId: string,
  fieldDefinitionId: string,
  attachmentId: string
): Promise<CardAttachmentCompleteUploadResult> {
  const supabase = await createSupabaseServerClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, message: YANDEX_DISK_MSG_AUTH_REQUIRED };
  }

  const result = await completeOneCardAttachmentUpload(
    supabase,
    userData.user.id,
    boardId,
    cardId,
    fieldDefinitionId,
    attachmentId
  );

  if (result.ok) {
    revalidatePath(`/boards/${boardId}`);
  }

  return result;
}

/**
 * Загрузка вложений карточки (YDB4.4 + YDB4.5): спец. 10.4 — по файлу после общих проверок.
 * FormData: поле `files` — один или несколько `File` (`input name="files" multiple`).
 * Для прогресса клиент→сервер (спец. 13.5 / YDB8.7) предпочтителен POST `cardAttachmentUploadApiPath`.
 */
export async function cardAttachmentUploadAction(
  boardId: string,
  cardId: string,
  fieldDefinitionId: string,
  formData: FormData
): Promise<CardAttachmentUploadActionResult> {
  const supabase = await createSupabaseServerClient();
  const raw = formData.getAll("files");
  const files = raw.filter((x): x is File => x instanceof File);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, message: YANDEX_DISK_MSG_AUTH_REQUIRED };
  }

  const result = await runCardAttachmentUpload(
    supabase,
    userData.user.id,
    boardId,
    cardId,
    fieldDefinitionId,
    files
  );

  if (result.ok && result.files.some((r) => r.ok)) {
    revalidatePath(`/boards/${boardId}`);
  }

  return result;
}
