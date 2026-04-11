import "server-only";

export type YandexDiskIntegrationEnv = {
  oauthClientId: string;
  oauthClientSecret: string;
  oauthRedirectUri: string;
  tokenEncryptionKey: string;
};

let cached: YandexDiskIntegrationEnv | null = null;

/**
 * Обязательные server-side переменные для OAuth Яндекса и шифрования токенов.
 * Вызов откладывайте до сценариев интеграции — при отсутствии env приложение в остальном может работать.
 */
export function getYandexDiskIntegrationEnv(): YandexDiskIntegrationEnv {
  if (cached) return cached;

  const oauthClientId = process.env.YANDEX_DISK_OAUTH_CLIENT_ID?.trim() ?? "";
  const oauthClientSecret = process.env.YANDEX_DISK_OAUTH_CLIENT_SECRET?.trim() ?? "";
  const oauthRedirectUri = process.env.YANDEX_DISK_OAUTH_REDIRECT_URI?.trim() ?? "";
  const tokenEncryptionKey = process.env.YANDEX_DISK_TOKEN_ENCRYPTION_KEY?.trim() ?? "";

  const missing: string[] = [];
  if (!oauthClientId) missing.push("YANDEX_DISK_OAUTH_CLIENT_ID");
  if (!oauthClientSecret) missing.push("YANDEX_DISK_OAUTH_CLIENT_SECRET");
  if (!oauthRedirectUri) missing.push("YANDEX_DISK_OAUTH_REDIRECT_URI");
  if (!tokenEncryptionKey) missing.push("YANDEX_DISK_TOKEN_ENCRYPTION_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Яндекс.Диск: не заданы переменные окружения: ${missing.join(
        ", "
      )}. Добавьте их на сервере (см. .env.local.example в web/).`
    );
  }

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(oauthRedirectUri);
  } catch {
    throw new Error(
      "Яндекс.Диск: YANDEX_DISK_OAUTH_REDIRECT_URI должен быть абсолютным URL (http или https)."
    );
  }
  if (redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:") {
    throw new Error(
      "Яндекс.Диск: YANDEX_DISK_OAUTH_REDIRECT_URI должен использовать схему http или https."
    );
  }

  if (tokenEncryptionKey.length < 32) {
    throw new Error(
      "Яндекс.Диск: YANDEX_DISK_TOKEN_ENCRYPTION_KEY слишком короткий (нужно минимум 32 символа)."
    );
  }

  cached = {
    oauthClientId,
    oauthClientSecret,
    oauthRedirectUri,
    tokenEncryptionKey
  };
  return cached;
}
