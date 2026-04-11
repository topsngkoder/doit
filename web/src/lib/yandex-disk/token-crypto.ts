import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getYandexDiskIntegrationEnv } from "./integration-env";

/** Префикс версии формата хранения в БД; при смене алгоритма добавить v2 и миграцию чтения. */
const PAYLOAD_VERSION_PREFIX = "v1.";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveAes256Key(keyMaterial: string): Buffer {
  return createHash("sha256").update(keyMaterial, "utf8").digest();
}

/**
 * Шифрует строку (OAuth access/refresh) для записи в `encrypted_*` колонки.
 * Формат: `v1.` + base64url(iv ‖ authTag ‖ ciphertext), AES-256-GCM.
 */
export function encryptSecret(plaintext: string): string {
  if (plaintext.length === 0) {
    throw new Error("Яндекс.Диск: нельзя шифровать пустую строку.");
  }

  const { tokenEncryptionKey } = getYandexDiskIntegrationEnv();
  const key = deriveAes256Key(tokenEncryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, authTag, ciphertext]);
  return PAYLOAD_VERSION_PREFIX + blob.toString("base64url");
}

/**
 * Расшифровывает значение из БД. Несовместимый формат или неверный ключ — осмысленная ошибка без утечки plaintext.
 */
export function decryptSecret(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed.startsWith(PAYLOAD_VERSION_PREFIX)) {
    throw new Error(
      "Яндекс.Диск: неподдерживаемый формат зашифрованных данных (ожидался префикс v1.)."
    );
  }

  const b64 = trimmed.slice(PAYLOAD_VERSION_PREFIX.length);
  const raw = Buffer.from(b64, "base64url");
  if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Яндекс.Диск: повреждённое значение зашифрованных данных.");
  }

  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const { tokenEncryptionKey } = getYandexDiskIntegrationEnv();
  const key = deriveAes256Key(tokenEncryptionKey);
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error(
      "Яндекс.Диск: не удалось расшифровать данные (неверный ключ или повреждённый ciphertext)."
    );
  }
}
