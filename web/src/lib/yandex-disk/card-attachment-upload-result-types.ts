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
