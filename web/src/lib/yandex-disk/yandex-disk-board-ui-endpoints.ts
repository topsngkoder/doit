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

/** GET — 302 на временный URL Яндекса (спец. 11.3: без прикладного кэша между запросами). YDB5.6: `fieldDefinitionId` в query. */
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
