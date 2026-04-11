/**
 * Стабильные относительные URL для UI доски: OAuth и скачивание вложений (YDB6.4).
 * Без секретов; только пути App Router.
 */

/** GET — редирект на Яндекс OAuth; подключение и переподключение того же аккаунта. */
export function yandexDiskOAuthStartPath(boardId: string): string {
  const q = new URLSearchParams({ boardId });
  return `/api/yandex-disk/oauth/start?${q.toString()}`;
}

/** GET — 302 на временный URL Яндекса (спец. 11.3: без прикладного кэша между запросами). */
export function cardAttachmentDownloadPath(
  boardId: string,
  cardId: string,
  attachmentId: string
): string {
  return `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/attachments/${encodeURIComponent(attachmentId)}/download`;
}
