"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureYandexDiskCardAttachmentFolder } from "@/lib/yandex-disk/ensure-yandex-disk-card-attachment-folder";
import { runCardAttachmentUpload } from "@/lib/yandex-disk/card-attachment-upload-runner";
import type {
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
