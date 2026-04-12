/**
 * Стабильные относительные URL для UI доски: OAuth и скачивание вложений (YDB6.4).
 * Без секретов; только пути App Router.
 */

/** GET — редирект на Яндекс OAuth; подключение и переподключение того же аккаунта. */
export function yandexDiskOAuthStartPath(boardId: string): string {
  const q = new URLSearchParams({ boardId });
  return `/api/yandex-disk/oauth/start?${q.toString()}`;
}

/**
 * POST multipart — загрузка вложений (YDB8.7: прогресс через XHR, по одному файлу за запрос).
 * Поля формы: `field_definition_id`, `files`.
 */
export function cardAttachmentUploadApiPath(boardId: string, cardId: string): string {
  return `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/attachments/upload`;
}

/**
 * POST JSON — короткий `prepare-upload` без передачи байтов файла через приложение (YDB4.8).
 * Тело: `{ field_definition_id, file: { name, size, type? } }`.
 */
export function cardAttachmentPrepareUploadApiPath(boardId: string, cardId: string): string {
  return `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/attachments/prepare-upload`;
}

/**
 * POST JSON — короткий `complete-upload` (YDB4.9): перевод `uploading -> ready` после direct upload.
 * Тело: `{ field_definition_id, attachment_id }`.
 */
export function cardAttachmentCompleteUploadApiPath(boardId: string, cardId: string): string {
  return `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/attachments/complete-upload`;
}

/**
 * POST JSON — best-effort пометка `uploading -> failed` при сбое/отмене direct upload (YDB4.9 recovery).
 * Тело: `{ field_definition_id, attachment_id }`.
 */
export function cardAttachmentFailUploadApiPath(boardId: string, cardId: string): string {
  return `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/attachments/fail-upload`;
}

/** GET — тело файла с `Content-Disposition` по `original_file_name` (спец. 11.5); временный URL Яндекса только на сервере (спец. 11.3). YDB5.6: `fieldDefinitionId` в query. */
export function cardAttachmentDownloadPath(
  boardId: string,
  cardId: string,
  attachmentId: string,
  fieldDefinitionId: string
): string {
  const base = `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/attachments/${encodeURIComponent(attachmentId)}/download`;
  const q = new URLSearchParams({ field_definition_id: fieldDefinitionId });
  return `${base}?${q.toString()}`;
}
