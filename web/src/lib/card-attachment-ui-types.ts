/**
 * Поля готового вложения для UI и `get_board_snapshot.card_ready_attachments`
 * (спец. 13.4; без storage_path и служебных полей).
 */
export type CardAttachmentListItem = {
  id: string;
  /** Определение поля доски типа `yandex_disk` (YDB4.7). */
  field_definition_id: string;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by_user_id: string;
};

/**
 * Готовые вложения карточки, сгруппированные по `field_definition_id` (YDB6.5).
 * Для поля без файлов ключа может не быть — используйте `record[id] ?? []`.
 */
export type CardReadyAttachmentsByFieldId = Record<string, CardAttachmentListItem[]>;

/** Синоним имени из журнала YDB6.2 / внутренних модулей. */
export type CardAttachmentReadyListItem = CardAttachmentListItem;
