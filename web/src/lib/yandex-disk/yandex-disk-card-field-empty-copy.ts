import type { BoardYandexDiskIntegrationSnapshot } from "@/lib/board-snapshot-types";
import { getYandexDiskIntegrationModalPresentation } from "./yandex-disk-integration-modal-presentation";

/**
 * Тексты пустого состояния поля «Яндекс диск» в карточке (спец. 13.3, 13.6).
 * Дублируют формулировки разд. 15.2 — файл без `server-only`, чтобы использовать в клиентских компонентах.
 */

export const YANDEX_DISK_CARD_FIELD_EMPTY_VIEWER = "Файлов пока нет." as const;

/** Спец. 13.3 — при наличии права загрузки и активной интеграции. */
export const YANDEX_DISK_CARD_FIELD_EMPTY_UPLOAD_CTA =
  "Перетащите файлы в эту область или нажмите кнопку «Добавить файлы»." as const;

export function getYandexDiskCardFieldUnavailableCopy(
  integration: BoardYandexDiskIntegrationSnapshot,
  options: {
    canManageIntegration: boolean;
  }
): { reason: string; ownerActionHint: string | null } | null {
  if (integration?.status === "active") {
    return null;
  }

  const presentation = getYandexDiskIntegrationModalPresentation(integration, {
    forIntegrationManager: options.canManageIntegration
  });

  return {
    reason: presentation.publicDescription,
    ownerActionHint:
      options.canManageIntegration && integration?.status === "reauthorization_required" ?
        "Откройте «Поля доски» и нажмите «Повторить авторизацию», чтобы снова включить загрузку и скачивание файлов."
      : null
  };
}

export function yandexDiskCardFieldNonActiveIntegrationHint(
  integration: BoardYandexDiskIntegrationSnapshot,
  options?: {
    canManageIntegration?: boolean;
  }
): string {
  return (
    getYandexDiskCardFieldUnavailableCopy(integration, {
      canManageIntegration: options?.canManageIntegration ?? true
    })?.reason ?? ""
  );
}
