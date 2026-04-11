import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

import { decryptSecret, encryptSecret } from "./token-crypto";
import { refreshAccessToken, YandexDiskClientError } from "./yandex-disk-client";
import {
  YANDEX_DISK_MSG_INTEGRATION_DISCONNECTED,
  YANDEX_DISK_MSG_NOT_CONNECTED,
  YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED,
  YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE,
  mapYandexDiskClientErrorToProductMessage
} from "./yandex-disk-product-messages";

const DEFAULT_SKEW_SECONDS = 120;

type IntegrationRow = {
  board_id: string;
  status: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token_expires_at: string | null;
};

export type EnsureBoardYandexDiskAccessTokenResult =
  | { ok: true; accessToken: string }
  | {
      ok: false;
      kind:
        | "not_found"
        | "disconnected"
        | "reauthorization_required"
        | "missing_tokens"
        | "refresh_transient";
      message: string;
    };

function accessTokenIsFresh(expiresAtIso: string | null, skewSeconds: number): boolean {
  if (!expiresAtIso) return false;
  const t = Date.parse(expiresAtIso);
  if (Number.isNaN(t)) return false;
  return t > Date.now() + skewSeconds * 1000;
}

function isFatalOAuthRefreshFailure(err: YandexDiskClientError): boolean {
  return (
    err.code === "oauth_invalid_grant" ||
    err.code === "oauth_invalid_client" ||
    err.code === "unauthorized"
  );
}

async function persistRefreshedTokens(
  boardId: string,
  bundle: { accessToken: string; refreshToken: string; expiresInSeconds: number }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = getSupabaseServiceRoleClient();
  const expiresAtIso = new Date(Date.now() + bundle.expiresInSeconds * 1000).toISOString();
  const { error } = await admin
    .from("board_yandex_disk_integrations")
    .update({
      encrypted_access_token: encryptSecret(bundle.accessToken),
      encrypted_refresh_token: encryptSecret(bundle.refreshToken),
      access_token_expires_at: expiresAtIso,
      status: "active",
      last_error_text: null
    })
    .eq("board_id", boardId);

  if (error) {
    console.error("board_yandex_disk_integrations persist after refresh:", error.message);
    return { ok: false, message: "Не удалось сохранить обновлённые токены интеграции." };
  }
  return { ok: true };
}

async function persistReauthorizationRequired(boardId: string): Promise<void> {
  const admin = getSupabaseServiceRoleClient();
  const { error } = await admin
    .from("board_yandex_disk_integrations")
    .update({
      status: "reauthorization_required",
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      access_token_expires_at: null,
      last_error_text: YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED
    })
    .eq("board_id", boardId);

  if (error) {
    console.error("board_yandex_disk_integrations reauthorization_required:", error.message);
  }
}

/**
 * Возвращает действующий OAuth access token для API Диска по `board_id`.
 *
 * Читает/пишет строку интеграции через `service_role` (у пользовательского клиента нет SELECT на таблицу).
 * Вызывать только из серверного кода, где уже проверены права на операцию с Диском для этой доски (YDB4/YDB5 и т.д.).
 *
 * Перед обращением к Яндексу обновляет access token по refresh, если срок истекает; при «мертвом» refresh —
 * ставит `reauthorization_required`, очищает секреты, пишет `last_error_text` (спец. YDB3.7).
 */
export async function ensureBoardYandexDiskAccessToken(
  boardId: string,
  options?: { skewSeconds?: number }
): Promise<EnsureBoardYandexDiskAccessTokenResult> {
  const skewSeconds = options?.skewSeconds ?? DEFAULT_SKEW_SECONDS;
  const admin = getSupabaseServiceRoleClient();

  const { data: row, error: readError } = await admin
    .from("board_yandex_disk_integrations")
    .select("board_id, status, encrypted_access_token, encrypted_refresh_token, access_token_expires_at")
    .eq("board_id", boardId)
    .maybeSingle();

  if (readError) {
    console.error("board_yandex_disk_integrations read (service):", readError.message);
    return {
      ok: false,
      kind: "refresh_transient",
      message: "Не удалось прочитать состояние интеграции Яндекс.Диска."
    };
  }

  if (!row) {
    return { ok: false, kind: "not_found", message: YANDEX_DISK_MSG_NOT_CONNECTED };
  }

  const integration = row as IntegrationRow;

  if (integration.status === "disconnected") {
    return {
      ok: false,
      kind: "disconnected",
      message: YANDEX_DISK_MSG_INTEGRATION_DISCONNECTED
    };
  }

  const canAttemptDisk =
    integration.status === "active" ||
    integration.status === "reauthorization_required" ||
    integration.status === "error";

  if (!canAttemptDisk) {
    return {
      ok: false,
      kind: "reauthorization_required",
      message: YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED
    };
  }

  if (!integration.encrypted_refresh_token) {
    await persistReauthorizationRequired(boardId);
    return {
      ok: false,
      kind: "missing_tokens",
      message: YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED
    };
  }

  let refreshPlain: string;
  try {
    refreshPlain = decryptSecret(integration.encrypted_refresh_token);
  } catch (e) {
    console.error("Yandex Disk: decrypt refresh_token failed", e);
    await persistReauthorizationRequired(boardId);
    return {
      ok: false,
      kind: "reauthorization_required",
      message: YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED
    };
  }

  let accessPlain: string | null = null;
  if (integration.encrypted_access_token) {
    try {
      accessPlain = decryptSecret(integration.encrypted_access_token);
    } catch (e) {
      console.error("Yandex Disk: decrypt access_token failed", e);
      await persistReauthorizationRequired(boardId);
      return {
        ok: false,
        kind: "reauthorization_required",
        message: YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED
      };
    }
  }

  if (
    accessPlain &&
    accessTokenIsFresh(integration.access_token_expires_at, skewSeconds)
  ) {
    return { ok: true, accessToken: accessPlain };
  }

  try {
    const bundle = await refreshAccessToken(refreshPlain);
    const persisted = await persistRefreshedTokens(boardId, bundle);
    if (!persisted.ok) {
      return { ok: false, kind: "refresh_transient", message: persisted.message };
    }
    return { ok: true, accessToken: bundle.accessToken };
  } catch (e) {
    if (e instanceof YandexDiskClientError && isFatalOAuthRefreshFailure(e)) {
      await persistReauthorizationRequired(boardId);
      return {
        ok: false,
        kind: "reauthorization_required",
        message: YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED
      };
    }

    if (e instanceof YandexDiskClientError) {
      const msg =
        mapYandexDiskClientErrorToProductMessage(e, "oauth_refresh") ??
        YANDEX_DISK_MSG_REAUTHORIZATION_REQUIRED;
      return { ok: false, kind: "refresh_transient", message: msg };
    }

    console.error("Yandex Disk: unexpected refresh error", e);
    return {
      ok: false,
      kind: "refresh_transient",
      message: YANDEX_DISK_MSG_YANDEX_SERVICE_UNAVAILABLE
    };
  }
}
