import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type BoardYandexDiskIntegrationOAuthPersistInput = {
  boardId: string;
  yandexAccountId: string;
  yandexLogin: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  accessTokenExpiresAtIso: string;
  connectedByUserId: string;
  lastAuthorizedAtIso: string;
};

/**
 * Фиксирует успешный OAuth для доски: одна строка на `board_id` (UNIQUE + upsert).
 * Повторное подключение того же или другого аккаунта обновляет эту строку, вторая `active`-запись для доски не появляется (YDB3.4).
 * Смена аккаунта при наличии `ready`-вложений блокируется в OAuth callback через RPC `yandex_disk_oauth_account_change_allowed` (YDB3.5).
 *
 * Пишет через `service_role`: у `authenticated` отозван SELECT на таблицу (YDB1.4), а `ON CONFLICT DO UPDATE` в PostgreSQL
 * требует привилегию SELECT на таблицу — иначе «permission denied for table». Вызывать только после проверки прав в маршруте.
 */
export function upsertBoardYandexDiskIntegrationAfterOAuth(
  input: BoardYandexDiskIntegrationOAuthPersistInput
) {
  const supabase = getSupabaseServiceRoleClient();
  const rootPath = `/doit/boards/${input.boardId}`;
  return supabase.from("board_yandex_disk_integrations").upsert(
    {
      board_id: input.boardId,
      yandex_account_id: input.yandexAccountId,
      yandex_login: input.yandexLogin,
      root_folder_path: rootPath,
      encrypted_access_token: input.encryptedAccessToken,
      encrypted_refresh_token: input.encryptedRefreshToken,
      access_token_expires_at: input.accessTokenExpiresAtIso,
      status: "active",
      connected_by_user_id: input.connectedByUserId,
      last_authorized_at: input.lastAuthorizedAtIso,
      last_error_text: null
    },
    { onConflict: "board_id" }
  );
}
