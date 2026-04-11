import type {
  CardAttachmentListItem,
  CardReadyAttachmentsByFieldId
} from "@/lib/card-attachment-ui-types";

export type BoardFieldDefinitionForYandexTileOrder = {
  id: string;
  fieldType: string;
  position: number;
};

/**
 * Плоский порядок готовых вложений для тайла карточки на доске (спец. 13.7):
 * поля типа `yandex_disk` в порядке `position` на доске; внутри поля — как в snapshot
 * (`uploaded_at`, `id` из `get_board_snapshot.card_ready_attachments`).
 */
export function flattenReadyYandexAttachmentsForBoardCardTile(
  fieldDefinitions: BoardFieldDefinitionForYandexTileOrder[],
  readyByField: CardReadyAttachmentsByFieldId
): CardAttachmentListItem[] {
  const yandexFields = [...fieldDefinitions]
    .filter((f) => f.fieldType === "yandex_disk")
    .sort((a, b) => a.position - b.position);
  const out: CardAttachmentListItem[] = [];
  for (const f of yandexFields) {
    out.push(...(readyByField[f.id] ?? []));
  }
  return out;
}
