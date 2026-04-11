import "server-only";

/**
 * Каталог вложений карточки на Яндекс.Диске (спец.): `/doit/boards/<boardId>/cards/<cardId>/`.
 * В API Диска передаём путь без завершающего слэша; файлы — `<attachmentId><extension>` внутри.
 */
export function yandexDiskCardAttachmentDirectoryPath(boardId: string, cardId: string): string {
  return `/doit/boards/${boardId}/cards/${cardId}`;
}

/**
 * Полный путь файла вложения на Диске: `/doit/boards/.../cards/.../<attachmentId><suffix>`.
 * `suffix` — расширение с ведущей точкой или пустая строка.
 */
export function yandexDiskCardAttachmentObjectPath(
  boardId: string,
  cardId: string,
  attachmentId: string,
  fileSuffix: string
): string {
  return `${yandexDiskCardAttachmentDirectoryPath(boardId, cardId)}/${attachmentId}${fileSuffix}`;
}
