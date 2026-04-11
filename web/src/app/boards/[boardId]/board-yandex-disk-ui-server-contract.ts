"use server";

/**
 * Единый server-side контракт доски для UI Яндекс.Диска и вложений карточек (YDB6.4).
 *
 * | Сценарий | Как вызывать |
 * |----------|----------------|
 * | Подключить / переподключить | навигация на URL из `yandexDiskOAuthStartPath(boardId)` (`@/lib/yandex-disk/yandex-disk-board-ui-endpoints`) |
 * | Отключить | `disconnectBoardYandexDiskIntegrationAction` |
 * | Загрузка | `cardAttachmentUploadAction` (опционально `cardAttachmentUploadPrecheckAction`) |
 * | Скачать | GET `cardAttachmentDownloadPath(boardId, cardId, attachmentId)` (тот же модуль endpoints) |
 * | Удалить | `deleteCardAttachmentAction` |
 * | Список вне snapshot | `listReadyCardAttachmentsAction` |
 */

export {
  cardAttachmentUploadAction,
  cardAttachmentUploadPrecheckAction,
  type CardAttachmentUploadActionResult,
  type CardAttachmentUploadFileItemResult,
  type CardAttachmentUploadPrecheckResult
} from "./card-attachment-upload-actions";

export {
  deleteCardAttachmentAction,
  type DeleteCardAttachmentResult
} from "./card-attachment-delete-actions";

export {
  listReadyCardAttachmentsAction,
  type CardAttachmentReadyListItem,
  type ListReadyCardAttachmentsResult
} from "./card-attachment-list-actions";

export {
  disconnectBoardYandexDiskIntegrationAction,
  type DisconnectBoardYandexDiskIntegrationResult
} from "./yandex-disk-integration-actions";
