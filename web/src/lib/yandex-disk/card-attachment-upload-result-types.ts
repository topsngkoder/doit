/** Итог по одному файлу в batch (YDB4.5). */
export type CardAttachmentUploadFileItemResult =
  | { originalName: string; ok: true }
  | { originalName: string; ok: false; message: string };

/**
 * Результат загрузки вложений (server action или POST upload API).
 * `ok: true` — batch обработан; возможен частичный успех по `files[]`.
 */
export type CardAttachmentUploadActionResult =
  | { ok: false; message: string }
  | { ok: true; files: CardAttachmentUploadFileItemResult[] };

/** Ответ короткого server-side шага `prepare-upload` для direct upload (YDB4.8). */
export type CardAttachmentPrepareUploadResult =
  | { ok: false; message: string }
  | {
      ok: true;
      file: {
        attachmentId: string;
        uploadUrl: string;
        uploadMethod: string;
      };
    };

/**
 * Ответ server-side шага `complete-upload` для direct upload (YDB4.9).
 * Сервер переводит запись `uploading -> ready` только если файл реально доступен на Диске.
 */
export type CardAttachmentCompleteUploadResult =
  | { ok: false; message: string; retryable?: boolean }
  | { ok: true };

/** Ответ шага `fail-upload` для direct upload: пометка `uploading -> failed` (best-effort). */
export type CardAttachmentFailUploadResult = { ok: false; message: string } | { ok: true };
