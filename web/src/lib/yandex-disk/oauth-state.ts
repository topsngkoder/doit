import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getYandexDiskIntegrationEnv } from "./integration-env";

const STATE_VERSION = 1 as const;
/** Время жизни state для round-trip OAuth (секунды). */
const STATE_TTL_SEC = 600;

type StateBodyV1 = {
  v: typeof STATE_VERSION;
  bid: string;
  uid: string;
  exp: number;
  n: string;
};

function stateSigningKey(): Buffer {
  const env = getYandexDiskIntegrationEnv();
  return createHmac("sha256", "yandex-disk-oauth-state-v1")
    .update(env.tokenEncryptionKey, "utf8")
    .digest();
}

/**
 * Подписанный OAuth state: привязка к доске и к пользователю Supabase, срок годности, одноразовый nonce.
 * Проверка — `verifyYandexDiskOAuthState` (callback, YDB3.3).
 */
export function signYandexDiskOAuthState(boardId: string, userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + STATE_TTL_SEC;
  const body: StateBodyV1 = {
    v: STATE_VERSION,
    bid: boardId,
    uid: userId,
    exp,
    n: randomBytes(16).toString("hex")
  };
  const bodyJson = JSON.stringify(body);
  const bodyB64 = Buffer.from(bodyJson, "utf8").toString("base64url");
  const sig = createHmac("sha256", stateSigningKey()).update(bodyB64).digest("base64url");
  return `${bodyB64}.${sig}`;
}

export type VerifyYandexDiskOAuthStateResult =
  | { ok: true; boardId: string; userId: string }
  | { ok: false };

export function verifyYandexDiskOAuthState(state: string): VerifyYandexDiskOAuthStateResult {
  const dot = state.indexOf(".");
  if (dot <= 0) return { ok: false };
  const bodyB64 = state.slice(0, dot);
  const sigB64 = state.slice(dot + 1);
  if (!bodyB64 || !sigB64) return { ok: false };

  let receivedSig: Buffer;
  try {
    receivedSig = Buffer.from(sigB64, "base64url");
  } catch {
    return { ok: false };
  }

  const expectedSig = createHmac("sha256", stateSigningKey()).update(bodyB64).digest();
  if (receivedSig.length !== expectedSig.length || !timingSafeEqual(expectedSig, receivedSig)) {
    return { ok: false };
  }

  let parsed: unknown;
  try {
    const json = Buffer.from(bodyB64, "base64url").toString("utf8");
    parsed = JSON.parse(json) as unknown;
  } catch {
    return { ok: false };
  }

  if (!parsed || typeof parsed !== "object") return { ok: false };
  const o = parsed as Record<string, unknown>;
  if (o.v !== STATE_VERSION || typeof o.bid !== "string" || typeof o.uid !== "string") {
    return { ok: false };
  }
  if (typeof o.exp !== "number" || !Number.isFinite(o.exp) || typeof o.n !== "string" || !o.n) {
    return { ok: false };
  }
  if (o.exp < Math.floor(Date.now() / 1000)) return { ok: false };

  return { ok: true, boardId: o.bid, userId: o.uid };
}
