import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { uploadOneCardAttachmentFile } from "@/lib/yandex-disk/card-attachment-upload-pipeline";
import { ensureYandexDiskCardAttachmentFolder } from "@/lib/yandex-disk/ensure-yandex-disk-card-attachment-folder";
import type {
  CardAttachmentUploadActionResult,
  CardAttachmentUploadFileItemResult
} from "@/lib/yandex-disk/card-attachment-upload-result-types";
import {
  filesToAttachmentUploadMetaList,
  validateCardAttachmentUploadRequest
} from "@/lib/yandex-disk/validate-card-attachment-upload-request";

/**
 * Общая серверная цепочка: валидация, папка на Диске, пофайловый pipeline (YDB4.4–4.5).
 * Без `revalidatePath` — вызывающий (action / route) ревалидирует при необходимости.
 */
export async function runCardAttachmentUpload(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  cardId: string,
  fieldDefinitionId: string,
  files: File[]
): Promise<CardAttachmentUploadActionResult> {
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

  const results: CardAttachmentUploadFileItemResult[] = [];

  for (const file of files) {
    const one = await uploadOneCardAttachmentFile(
      supabase,
      userId,
      boardId,
      cardId,
      fieldDefinitionId,
      file
    );
    if (one.ok) {
      results.push({ originalName: file.name, ok: true });
    } else {
      results.push({ originalName: file.name, ok: false, message: one.message });
    }
  }

  return { ok: true, files: results };
}
