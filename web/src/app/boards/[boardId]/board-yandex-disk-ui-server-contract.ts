/**
 * Единый server-side контракт доски для UI Яндекс.Диска и вложений карточек (YDB6.4).
 *
 * Файл без директивы `"use server"`: в Next.js 15 из такого модуля нельзя реэкспортировать типы
 * вместе с actions, если пометить его `"use server"` (разрешены только async server actions).
 * Сами действия объявлены в модулях с `"use server"`.
 *
 * | Сценарий | Как вызывать |
 * |----------|----------------|
 * | Подключить / переподключить | навигация на URL из `yandexDiskOAuthStartPath(boardId)` (`@/lib/yandex-disk/yandex-disk-board-ui-endpoints`) |
 * | Отключить | `disconnectBoardYandexDiskIntegrationAction` |
 * | Загрузка | Текущий UI с прогрессом: POST `cardAttachmentUploadApiPath(boardId, cardId)` + `FormData`; direct-upload prepare: POST `cardAttachmentPrepareUploadApiPath(boardId, cardId)` с JSON `{ field_definition_id, file }`; server actions: `cardAttachmentPrepareUploadAction`, `cardAttachmentUploadAction`; precheck — `cardAttachmentUploadPrecheckAction` |
 * | Скачать | GET `cardAttachmentDownloadPath(boardId, cardId, attachmentId, fieldDefinitionId)` — ответ с телом файла и именем из БД (`original_file_name`, спец. 11.5) |
 * | Удалить | `deleteCardAttachmentAction(boardId, cardId, attachmentId, fieldDefinitionId)` |
 * | Список вне snapshot | `listReadyCardAttachmentsAction(boardId, cardId, fieldDefinitionId)` |
 */

export {
  cardAttachmentCompleteUploadAction,
  cardAttachmentPrepareUploadAction,
  cardAttachmentUploadAction,
  cardAttachmentUploadPrecheckAction,
  type CardAttachmentPrepareUploadResult,
  type CardAttachmentCompleteUploadResult,
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
