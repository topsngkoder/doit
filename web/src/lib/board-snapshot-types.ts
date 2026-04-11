import type {
  CardAttachmentListItem,
  CardReadyAttachmentsByFieldId
} from "@/lib/card-attachment-ui-types";

/** Статус интеграции Яндекс.Диска в snapshot (совпадает с CHECK в БД, YDB1.1). */
export type BoardYandexDiskIntegrationStatus =
  | "active"
  | "reauthorization_required"
  | "disconnected"
  | "error";

/**
 * Одна строка интеграции из `get_board_snapshot` без токенов (YDB6.1).
 * Поля кроме `status` обнуляются RPC для пользователей без права деталей.
 */
export type BoardYandexDiskIntegrationSnapshotRow = {
  status: BoardYandexDiskIntegrationStatus;
  yandex_login: string | null;
  root_folder_path: string | null;
  last_authorized_at: string | null;
  last_error_text: string | null;
};

/** `null`, если записи в `board_yandex_disk_integrations` нет. */
export type BoardYandexDiskIntegrationSnapshot = BoardYandexDiskIntegrationSnapshotRow | null;

export type GetBoardSnapshotBoard = {
  id: string;
  name: string;
  background_type: "none" | "image";
  background_color: string | null;
  background_image_path: string | null;
};

export type GetBoardSnapshotRole = { id: string; key: string; name: string };

export type GetBoardSnapshotMember = {
  user_id: string;
  board_role_id: string;
  is_owner: boolean;
  display_name: string;
  email: string;
  avatar_url: string | null;
  role_name: string;
  role_key: string;
};

export type GetBoardSnapshotColumn = {
  id: string;
  name: string;
  column_type: string;
  position: number;
};

export type GetBoardSnapshotCard = {
  id: string;
  column_id: string;
  title: string;
  description: string;
  position: number;
  created_by_user_id: string;
  responsible_user_id: string | null;
};

export type GetBoardSnapshotLabel = {
  id: string;
  name: string;
  color: string;
  position: number;
};

export type GetBoardSnapshotFieldOption = {
  id: string;
  name: string;
  color: string;
  position: number;
};

export type GetBoardSnapshotFieldDefinition = {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
  position: number;
  select_options: GetBoardSnapshotFieldOption[];
};

export type GetBoardSnapshotPreviewItem = {
  id: string;
  item_type: string;
  field_definition_id: string | null;
  enabled: boolean;
  position: number;
};

export type GetBoardSnapshotCardAssignee = { card_id: string; user_id: string };
export type GetBoardSnapshotCardLabel = { card_id: string; label_id: string };

export type GetBoardSnapshotCardFieldValue = {
  card_id: string;
  field_definition_id: string;
  text_value: string | null;
  date_value: string | null;
  link_url: string | null;
  link_text: string | null;
  select_option_id: string | null;
};

export type GetBoardSnapshotActivity = {
  id: string;
  card_id: string;
  actor_user_id: string;
  actor_display_name: string;
  activity_type: string;
  message: string;
  created_at: string;
};

/** Элемент плоского массива `card_ready_attachments` в RPC (YDB6.2 / YDB4.7). */
export type CardReadyAttachmentSnapshotRow = CardAttachmentListItem & {
  card_id: string;
};

/**
 * Строит для каждой карточки словарь вложений по `field_definition_id` из плоского массива snapshot.
 * Единая точка группировки для SSR и тестов (YDB6.5).
 */
export function mapCardReadyAttachmentsRowsByCardId(
  rows: CardReadyAttachmentSnapshotRow[] | null | undefined
): Map<string, CardReadyAttachmentsByFieldId> {
  const byCard = new Map<string, CardReadyAttachmentsByFieldId>();
  for (const row of rows ?? []) {
    if (!row?.card_id || !row?.id || !row.field_definition_id) continue;
    const item: CardAttachmentListItem = {
      id: String(row.id),
      field_definition_id: String(row.field_definition_id),
      original_file_name: String(row.original_file_name ?? ""),
      mime_type: String(row.mime_type ?? ""),
      size_bytes: Number(row.size_bytes ?? 0),
      uploaded_at: String(row.uploaded_at ?? ""),
      uploaded_by_user_id: String(row.uploaded_by_user_id ?? "")
    };
    const cardId = String(row.card_id);
    const fieldId = item.field_definition_id;
    let byField = byCard.get(cardId);
    if (!byField) {
      byField = {};
      byCard.set(cardId, byField);
    }
    const list = byField[fieldId] ?? [];
    list.push(item);
    byField[fieldId] = list;
  }
  return byCard;
}

/**
 * Тело ответа `get_board_snapshot` после успешного RPC.
 * Один узкий cast из `unknown` — в {@link toBoardSnapshotPayload}.
 */
export type GetBoardSnapshotResult = {
  current_user_id: string;
  board: GetBoardSnapshotBoard;
  is_system_admin: boolean;
  my_role_id: string | null;
  allowed_permissions: string[];
  roles: GetBoardSnapshotRole[];
  members: GetBoardSnapshotMember[];
  columns: GetBoardSnapshotColumn[];
  cards: GetBoardSnapshotCard[];
  labels: GetBoardSnapshotLabel[];
  field_definitions: GetBoardSnapshotFieldDefinition[];
  preview_items: GetBoardSnapshotPreviewItem[];
  card_assignees: GetBoardSnapshotCardAssignee[];
  card_labels: GetBoardSnapshotCardLabel[];
  card_field_values: GetBoardSnapshotCardFieldValue[];
  comments_count_by_card: Record<string, number>;
  activity: GetBoardSnapshotActivity[];
  card_ready_attachments: CardReadyAttachmentSnapshotRow[];
  yandex_disk_integration: BoardYandexDiskIntegrationSnapshot;
};

export function toBoardSnapshotPayload(raw: unknown): GetBoardSnapshotResult {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Некорректный ответ get_board_snapshot");
  }
  return raw as GetBoardSnapshotResult;
}
