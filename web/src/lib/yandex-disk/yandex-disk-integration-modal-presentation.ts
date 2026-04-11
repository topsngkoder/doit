import type { BoardYandexDiskIntegrationSnapshot } from "@/lib/board-snapshot-types";

/**
 * Визуальный вариант блока состояния в модалке настроек Яндекс.Диска (YDB7.2).
 * Тексты публичных подсказок согласованы с разделом 15.2 спецификации, где строки зафиксированы.
 */
export type YandexDiskIntegrationModalVariant =
  | "none"
  | "active"
  | "reauthorization_required"
  | "disconnected"
  | "error";

export type YandexDiskIntegrationModalPresentation = {
  variant: YandexDiskIntegrationModalVariant;
  title: string;
  /** Безопасное для любого зрителя пояснение (без токенов и сырого ответа провайдера). */
  publicDescription: string;
  panelClassName: string;
  badgeClassName: string;
};

export type YandexDiskIntegrationModalPresentationOptions = {
  /**
   * Владелец доски или sysadmin — полные состояния по спец. 14.1–14.2.
   * Иначе только факт наличия/отсутствия рабочей интеграции (спец. 14.3).
   */
  forIntegrationManager: boolean;
};

const VIEWER_MSG_INTEGRATION_AVAILABLE =
  "На доске подключён Яндекс.Диск для хранения файлов карточек." as const;

const VIEWER_MSG_INTEGRATION_UNAVAILABLE =
  "Яндекс.Диск для этой доски не подключён или сейчас недоступен." as const;

const PANEL_BASE =
  "space-y-2 rounded-[var(--radius-surface)] border p-3 transition-[border-color,background-color] duration-150";

const BADGE_BASE =
  "inline-flex w-fit rounded-[var(--radius-control)] border px-2 py-0.5 text-[11px] font-semibold leading-tight";

/** Совпадает с `YANDEX_DISK_MSG_NOT_CONNECTED` (server-only модуль не импортируем в клиент). */
const MSG_NOT_CONNECTED = "Для этой доски не подключён Яндекс.Диск." as const;

/** Совпадает с `YANDEX_DISK_MSG_INTEGRATION_DISCONNECTED`. */
const MSG_DISCONNECTED = "Интеграция Яндекс.Диска для этой доски отключена." as const;

/** Совпадает с `YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED`. */
const MSG_REAUTH =
  "Подключение к Яндекс.Диску требует повторной авторизации владельца доски." as const;

const OWNER_LAST_ERROR_WHITELIST = new Set<string>([MSG_REAUTH]);

/**
 * Текст `last_error_text` из snapshot показываем только если он совпадает с известным продуктовым сообщением
 * (YDB7.5 — не выводим произвольные строки из БД).
 */
export function safeYandexDiskIntegrationLastErrorTextForOwner(
  text: string | null | undefined
): string | null {
  const t = text?.trim();
  if (!t) return null;
  return OWNER_LAST_ERROR_WHITELIST.has(t) ? t : null;
}

export function getYandexDiskIntegrationModalPresentation(
  integration: BoardYandexDiskIntegrationSnapshot,
  options?: YandexDiskIntegrationModalPresentationOptions
): YandexDiskIntegrationModalPresentation {
  const forIntegrationManager = options?.forIntegrationManager ?? true;

  if (!forIntegrationManager) {
    const active = integration?.status === "active";
    if (active) {
      return {
        variant: "active",
        title: "Подключено",
        publicDescription: VIEWER_MSG_INTEGRATION_AVAILABLE,
        panelClassName: `${PANEL_BASE} border-[color:var(--success-subtle-border)] bg-[color:var(--success-subtle-bg)]`,
        badgeClassName: `${BADGE_BASE} border-[color:var(--success-subtle-border)] bg-[color:var(--success-subtle-bg)] text-[color:var(--success-subtle-text)]`
      };
    }
    return {
      variant: "none",
      title: "Не подключено",
      publicDescription: VIEWER_MSG_INTEGRATION_UNAVAILABLE,
      panelClassName: `${PANEL_BASE} border-app-default bg-app-surface-muted`,
      badgeClassName: `${BADGE_BASE} border-app-default bg-app-surface-subtle text-app-secondary`
    };
  }

  if (!integration) {
    return {
      variant: "none",
      title: "Не подключено",
      publicDescription: MSG_NOT_CONNECTED,
      panelClassName: `${PANEL_BASE} border-app-default bg-app-surface-muted`,
      badgeClassName: `${BADGE_BASE} border-app-default bg-app-surface-subtle text-app-secondary`
    };
  }

  switch (integration.status) {
    case "active":
      return {
        variant: "active",
        title: "Подключено",
        publicDescription:
          "Интеграция активна: файлы карточек сохраняются в папке доски на Яндекс.Диске.",
        panelClassName: `${PANEL_BASE} border-[color:var(--success-subtle-border)] bg-[color:var(--success-subtle-bg)]`,
        badgeClassName: `${BADGE_BASE} border-[color:var(--success-subtle-border)] bg-[color:var(--success-subtle-bg)] text-[color:var(--success-subtle-text)]`
      };
    case "reauthorization_required":
      return {
        variant: "reauthorization_required",
        title: "Требуется повторная авторизация",
        publicDescription: MSG_REAUTH,
        panelClassName: `${PANEL_BASE} border-[color:var(--warning-subtle-border)] bg-[color:var(--warning-subtle-bg)]`,
        badgeClassName: `${BADGE_BASE} border-[color:var(--warning-subtle-border)] bg-[color:var(--warning-subtle-bg)] text-[color:var(--warning-subtle-text)]`
      };
    case "disconnected":
      return {
        variant: "disconnected",
        title: "Отключено",
        publicDescription: MSG_DISCONNECTED,
        panelClassName: `${PANEL_BASE} border-dashed border-[color:var(--accent-subtle-border)] bg-[color:var(--accent-subtle-bg)]`,
        badgeClassName: `${BADGE_BASE} border-[color:var(--accent-subtle-border)] bg-[color:var(--accent-subtle-bg)] text-[color:var(--accent-subtle-text)]`
      };
    case "error":
      return {
        variant: "error",
        title: "Ошибка",
        publicDescription:
          "Интеграция с Яндекс.Диском в состоянии ошибки. Владелец доски может увидеть детали ниже и повторно подключить доступ.",
        panelClassName: `${PANEL_BASE} border-[color:var(--danger-subtle-border)] bg-[color:var(--danger-subtle-bg)]`,
        badgeClassName: `${BADGE_BASE} border-[color:var(--danger-subtle-border)] bg-[color:var(--danger-subtle-bg)] text-[color:var(--danger-subtle-text)]`
      };
    default: {
      const _exhaustive: never = integration.status;
      return _exhaustive;
    }
  }
}
