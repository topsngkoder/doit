import type { BoardYandexDiskIntegrationSnapshot } from "@/lib/board-snapshot-types";

/**
 * Тексты пустого состояния поля «Яндекс диск» в карточке (спец. 13.3, 13.6).
 * Дублируют формулировки разд. 15.2 — файл без `server-only`, чтобы использовать в клиентских компонентах.
 */

export const YANDEX_DISK_CARD_FIELD_EMPTY_VIEWER = "Файлов пока нет." as const;

/** Спец. 13.3 — при наличии права загрузки и активной интеграции. */
export const YANDEX_DISK_CARD_FIELD_EMPTY_UPLOAD_CTA =
  "Перетащите файлы в эту область или нажмите кнопку «Добавить файлы»." as const;

export function yandexDiskCardFieldNonActiveIntegrationHint(
  integration: BoardYandexDiskIntegrationSnapshot
): string {
  if (integration == null) {
    return "Для этой доски не подключён Яндекс.Диск.";
  }
  switch (integration.status) {
    case "active":
      return "";
    case "disconnected":
      return "Интеграция Яндекс.Диска для этой доски отключена.";
    case "reauthorization_required":
      return "Подключение к Яндекс.Диску требует повторной авторизации владельца доски.";
    case "error":
      return "Сервис Яндекс.Диска временно недоступен. Попробуйте позже.";
  }
}
