import "server-only";

import { normalizeUuidParam } from "@/lib/board-id-param";

import { ensureBoardYandexDiskAccessToken } from "./board-yandex-disk-access-token";
import { diskEnsureFolderChain, YandexDiskClientError } from "./yandex-disk-client";
import {
  mapYandexDiskClientErrorToProductMessage,
  YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE
} from "./yandex-disk-product-messages";
import { yandexDiskCardAttachmentDirectoryPath } from "./yandex-disk-card-attachment-paths";

export type EnsureYandexDiskCardAttachmentFolderResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Перед загрузкой вложений: гарантирует цепочку до `/doit/boards/<boardId>/cards/<cardId>/`.
 * Идемпотентно: существующие каталоги не пересоздаются (YDB4.3).
 *
 * Вызывать только после проверок прав и активной интеграции (`validateCardAttachmentUploadRequest`).
 */
export async function ensureYandexDiskCardAttachmentFolder(
  boardId: string,
  cardId: string
): Promise<EnsureYandexDiskCardAttachmentFolderResult> {
  const b = normalizeUuidParam(boardId);
  const c = normalizeUuidParam(cardId);
  if (!b || !c) {
    return { ok: false, message: "Некорректный идентификатор доски или карточки." };
  }

  const tokenResult = await ensureBoardYandexDiskAccessToken(b);
  if (!tokenResult.ok) {
    return { ok: false, message: tokenResult.message };
  }

  const dirPath = yandexDiskCardAttachmentDirectoryPath(b, c);
  try {
    await diskEnsureFolderChain(tokenResult.accessToken, dirPath);
    return { ok: true };
  } catch (e) {
    if (e instanceof YandexDiskClientError) {
      const mapped =
        mapYandexDiskClientErrorToProductMessage(e, "integration_folder") ??
        YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE;
      console.error("ensureYandexDiskCardAttachmentFolder:", e.code, e.rawProviderMessage ?? e.message);
      return { ok: false, message: mapped };
    }
    console.error("ensureYandexDiskCardAttachmentFolder:", e);
    return { ok: false, message: YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE };
  }
}
