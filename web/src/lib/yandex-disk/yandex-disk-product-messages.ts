import "server-only";

import type { YandexDiskClientError } from "./yandex-disk-client";

/** Раздел 8.1 спецификации — управление интеграцией только у владельца доски (не через роли). */
export const YANDEX_DISK_MSG_INTEGRATION_OWNER_ONLY =
  "Подключать, отключать и переподключать Яндекс.Диск может только владелец доски." as const;

/** Раздел 15.1 — авторизация и права (вложения карточек). */
export const YANDEX_DISK_MSG_AUTH_REQUIRED = "Нужна авторизация." as const;
/** Раздел 15.1 — право на подключение интеграции к доске (OAuth callback / баннер доски). */
export const YANDEX_DISK_MSG_NO_BOARD_YANDEX_CONNECT_PERMISSION =
  "У вас нет права подключать Яндекс.Диск для этой доски." as const;
export const YANDEX_DISK_MSG_NO_UPLOAD_PERMISSION =
  "У вас нет права загружать файлы в эту карточку." as const;
export const YANDEX_DISK_MSG_NO_DELETE_PERMISSION =
  "У вас нет права удалять файлы этой карточки." as const;
/** Поле не является файловым полем Яндекс.Диска на этой доске (YDB4.7). */
export const YANDEX_DISK_MSG_INVALID_YANDEX_DISK_FIELD =
  "Указано недопустимое поле для файлов Яндекс.Диска." as const;

/** Раздел 15.3 — валидация файлов до обращения к Диску (спец. 10.2). */
export const YANDEX_DISK_MSG_FILE_EMPTY = "Файл пустой." as const;
export const YANDEX_DISK_MSG_FILE_TOO_LARGE =
  "Файл слишком большой. Максимальный размер файла — 1 ГБ." as const;
export const YANDEX_DISK_MSG_TOO_MANY_FILES_IN_BATCH =
  "Нельзя загрузить больше 20 файлов за один раз." as const;
export const YANDEX_DISK_MSG_CARD_ATTACHMENT_LIMIT =
  "Для этого файлового поля достигнут лимит вложений (не более 200 файлов)." as const;

/** Раздел 15.2 спецификации — ошибки интеграции (провайдер / OAuth). */
export const YANDEX_DISK_MSG_NOT_CONNECTED = "Для этой доски не подключён Яндекс.Диск." as const;
/** Интеграция в статусе `disconnected` (YDB3.6 / YDB3.7). */
export const YANDEX_DISK_MSG_INTEGRATION_DISCONNECTED =
  "Интеграция Яндекс.Диска для этой доски отключена." as const;
export const YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED =
  "Подключение к Яндекс.Диску требует повторной авторизации владельца доски." as const;
export const YANDEX_DISK_MSG_BOARD_FOLDER_CREATE_FAILED =
  "Не удалось создать папку доски в Яндекс.Диске." as const;
export const YANDEX_DISK_MSG_CANNOT_CHANGE_DISK_WITH_FILES =
  "Нельзя сменить Яндекс.Диск для доски, пока в карточках есть файлы." as const;

/**
 * Сообщения после редиректа с OAuth callback (`?yandex_disk_oauth=…`).
 * Там, где в разд. 15.2 нет отдельной строки, используются нейтральные формулировки без деталей провайдера и БД.
 */
export const YANDEX_DISK_MSG_OAUTH_SUCCESS =
  "Яндекс.Диск для доски успешно подключён." as const;
export const YANDEX_DISK_MSG_OAUTH_USER_DENIED =
  "Подключение Яндекс.Диска отменено." as const;
export const YANDEX_DISK_MSG_OAUTH_CALLBACK_INCOMPLETE =
  "Не удалось завершить подключение. Попробуйте начать заново из настроек доски." as const;
export const YANDEX_DISK_MSG_OAUTH_STATE_EXPIRED =
  "Сессия подключения устарела. Откройте настройки доски и начните подключение заново." as const;
/** Неверная конфигурация сервера; в UI не перечисляем имена переменных окружения. */
export const YANDEX_DISK_MSG_OAUTH_SERVER_MISCONFIGURED =
  "Подключение Яндекс.Диска временно недоступно. Обратитесь к администратору." as const;
export const YANDEX_DISK_MSG_OAUTH_SESSION_USER_MISMATCH =
  "Войдите под той же учётной записью, с которой начали подключение Яндекс.Диска." as const;
export const YANDEX_DISK_MSG_OAUTH_DB_PERSIST_FAILED =
  "Не удалось сохранить настройки интеграции. Попробуйте позже." as const;
export const YANDEX_DISK_MSG_DISCONNECT_FAILED =
  "Не удалось отключить интеграцию Яндекс.Диска. Попробуйте позже." as const;
export const YANDEX_DISK_MSG_INTEGRATION_PERMISSION_CHECK_FAILED =
  "Не удалось проверить право управления интеграцией. Попробуйте позже." as const;

/** Раздел 15.3 — ошибки файлов (ответы API Диска при upload/download/delete). */
export const YANDEX_DISK_MSG_FILE_NOT_FOUND_ON_DISK = "Файл не найден в Яндекс.Диске." as const;
export const YANDEX_DISK_MSG_UPLOAD_FAILED = "Не удалось загрузить файл в Яндекс.Диск." as const;
export const YANDEX_DISK_MSG_DOWNLOAD_FAILED = "Не удалось скачать файл из Яндекс.Диска." as const;
export const YANDEX_DISK_MSG_DELETE_FAILED = "Не удалось удалить файл из Яндекс.Диска." as const;

/**
 * Нет отдельной строки в разделе 15 для сетевых/неизвестных сбоев OAuth и login.yandex.ru;
 * используется вместо сырого текста провайдера.
 */
export const YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE =
  "Сервис Яндекс.Диска временно недоступен. Попробуйте позже." as const;

/**
 * Контекст вызова: по нему выбирается фиксированный текст из раздела 15,
 * без использования rawProviderMessage / message от API.
 */
export type YandexDiskProductOperation =
  | "oauth_authorize"
  | "oauth_refresh"
  | "integration_folder"
  | "upload"
  | "download"
  | "delete"
  | "profile"
  | "generic_disk";

/**
 * Возвращает продуктовое сообщение для UI или `null`, если пользователю ничего показывать не нужно
 * (например, удаление уже отсутствующего файла — обрабатывается на уровне сценария).
 */
export function mapYandexDiskClientErrorToProductMessage(
  err: YandexDiskClientError,
  operation: YandexDiskProductOperation
): string | null {
  if (operation === "delete" && err.code === "not_found") {
    return null;
  }

  if (operation === "download" && err.code === "not_found") {
    return YANDEX_DISK_MSG_FILE_NOT_FOUND_ON_DISK;
  }

  if (err.code === "oauth_invalid_grant" || err.code === "unauthorized") {
    return YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED;
  }

  switch (operation) {
    case "oauth_authorize":
    case "oauth_refresh":
      if (err.code === "oauth_invalid_client") {
        return YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED;
      }
      if (err.code === "network_error" || err.code === "provider_error" || err.code === "rate_limited") {
        return YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE;
      }
      return YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE;

    case "profile":
      if (err.code === "network_error" || err.code === "provider_error") {
        return YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE;
      }
      return YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE;

    case "integration_folder":
      return YANDEX_DISK_MSG_BOARD_FOLDER_CREATE_FAILED;

    case "upload":
      return YANDEX_DISK_MSG_UPLOAD_FAILED;

    case "download":
      return YANDEX_DISK_MSG_DOWNLOAD_FAILED;

    case "delete":
      return YANDEX_DISK_MSG_DELETE_FAILED;

    case "generic_disk":
      return fallbackGenericDisk(err);
  }
}

function fallbackGenericDisk(err: YandexDiskClientError): string {
  if (err.code === "not_found") {
    return YANDEX_DISK_MSG_FILE_NOT_FOUND_ON_DISK;
  }
  if (err.code === "insufficient_storage") {
    return YANDEX_DISK_MSG_UPLOAD_FAILED;
  }
  if (err.code === "network_error") {
    return YANDEX_DISK_MSG_DOWNLOAD_FAILED;
  }
  return YANDEX_DISK_MSG_DOWNLOAD_FAILED;
}

/** Значение query `yandex_disk_oauth` после редиректа из `api/yandex-disk/oauth/callback`. */
export type YandexDiskOauthReturnFlag =
  | "success"
  | "denied"
  | "invalid"
  | "invalid_state"
  | "config"
  | "session_mismatch"
  | "forbidden"
  | "provider"
  | "db_error"
  | "cannot_change_with_files";

/**
 * Текст баннера на странице доски; `null` — не показывать (в т.ч. неизвестный флаг).
 */
export function yandexDiskOauthReturnBannerMessage(
  flag: string | null | undefined
): string | null {
  if (flag == null || flag === "") return null;
  switch (flag as YandexDiskOauthReturnFlag) {
    case "success":
      return YANDEX_DISK_MSG_OAUTH_SUCCESS;
    case "denied":
      return YANDEX_DISK_MSG_OAUTH_USER_DENIED;
    case "invalid":
      return YANDEX_DISK_MSG_OAUTH_CALLBACK_INCOMPLETE;
    case "invalid_state":
      return YANDEX_DISK_MSG_OAUTH_STATE_EXPIRED;
    case "config":
      return YANDEX_DISK_MSG_OAUTH_SERVER_MISCONFIGURED;
    case "session_mismatch":
      return YANDEX_DISK_MSG_OAUTH_SESSION_USER_MISMATCH;
    case "forbidden":
      return YANDEX_DISK_MSG_NO_BOARD_YANDEX_CONNECT_PERMISSION;
    case "provider":
      return YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE;
    case "db_error":
      return YANDEX_DISK_MSG_OAUTH_DB_PERSIST_FAILED;
    case "cannot_change_with_files":
      return YANDEX_DISK_MSG_CANNOT_CHANGE_DISK_WITH_FILES;
    default:
      return null;
  }
}
