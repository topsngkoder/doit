import "server-only";

import { getYandexDiskIntegrationEnv } from "./integration-env";

const OAUTH_TOKEN_URL = "https://oauth.yandex.com/token";
const LOGIN_INFO_URL = "https://login.yandex.ru/info";
const DISK_API_BASE = "https://cloud-api.yandex.net/v1/disk";

/** Коды для маппинга в продуктовые сообщения (YDB2.4) и ветвления refresh/reauth. */
export type YandexDiskClientErrorCode =
  | "oauth_invalid_grant"
  | "oauth_invalid_client"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "already_exists"
  | "insufficient_storage"
  | "rate_limited"
  | "bad_request"
  | "provider_error"
  | "network_error";

/** Для текста в UI — `mapYandexDiskClientErrorToProductMessage` в `yandex-disk-product-messages.ts` (не показывать `message` / `rawProviderMessage`). */
export class YandexDiskClientError extends Error {
  readonly code: YandexDiskClientErrorCode;
  readonly httpStatus?: number;
  readonly oauthError?: string;
  readonly diskError?: string;
  /** Сырой текст/описание от API (только для логов; в UI — через mapYandexDiskClientErrorToProductMessage). */
  readonly rawProviderMessage?: string;
  readonly oauthGrantType?: "authorization_code" | "refresh_token";

  constructor(
    message: string,
    code: YandexDiskClientErrorCode,
    init?: {
      httpStatus?: number;
      oauthError?: string;
      diskError?: string;
      rawProviderMessage?: string;
      oauthGrantType?: "authorization_code" | "refresh_token";
      cause?: unknown;
    }
  ) {
    super(message, init?.cause ? { cause: init.cause } : undefined);
    this.name = "YandexDiskClientError";
    this.code = code;
    this.httpStatus = init?.httpStatus;
    this.oauthError = init?.oauthError;
    this.diskError = init?.diskError;
    this.rawProviderMessage = init?.rawProviderMessage;
    this.oauthGrantType = init?.oauthGrantType;
  }
}

export type YandexOAuthTokenBundle = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

export type YandexLoginProfile = {
  id: string;
  login: string;
  displayName: string | null;
};

type OAuthTokenJson = {
  access_token: string;
  expires_in: number;
  token_type?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

type DiskErrorJson = {
  message?: string;
  description?: string;
  error?: string;
};

function normalizeDiskPath(path: string): string {
  const t = path.trim();
  if (!t.startsWith("/")) {
    throw new YandexDiskClientError("Яндекс.Диск: путь должен начинаться с «/».", "bad_request");
  }
  if (t.length > 1 && t.endsWith("/")) {
    return t.replace(/\/+$/, "");
  }
  return t;
}

async function safeReadJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function oauthErrorToCode(error: string | undefined): YandexDiskClientErrorCode {
  switch (error) {
    case "invalid_grant":
      return "oauth_invalid_grant";
    case "invalid_client":
      return "oauth_invalid_client";
    default:
      return "provider_error";
  }
}

function diskStatusToCode(status: number, diskError?: string): YandexDiskClientErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "already_exists";
  if (status === 423) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status === 507) return "insufficient_storage";
  if (diskError === "DiskNotFoundError") return "not_found";
  if (diskError === "DiskResourceAlreadyExistsError") return "already_exists";
  if (diskError === "DiskAccessDeniedError") return "forbidden";
  if (status >= 400 && status < 500) return "bad_request";
  return "provider_error";
}

function assertDiskError(res: Response, body: unknown): void {
  if (res.ok) return;
  const d = body && typeof body === "object" ? (body as DiskErrorJson) : {};
  const diskError = typeof d.error === "string" ? d.error : undefined;
  const code = diskStatusToCode(res.status, diskError);
  const raw =
    (typeof d.message === "string" && d.message) ||
    (typeof d.description === "string" && d.description) ||
    undefined;
  throw new YandexDiskClientError(`Яндекс.Диск: ошибка API (${res.status}).`, code, {
    httpStatus: res.status,
    diskError,
    rawProviderMessage: raw
  });
}

async function fetchDisk(
  accessToken: string,
  pathAndQuery: string,
  init?: Pick<RequestInit, "method" | "body" | "signal">
): Promise<Response> {
  const url = `${DISK_API_BASE}${pathAndQuery}`;
  try {
    return await fetch(url, {
      method: init?.method,
      body: init?.body,
      signal: init?.signal,
      headers: {
        Accept: "application/json",
        Authorization: `OAuth ${accessToken}`
      }
    });
  } catch (e) {
    throw new YandexDiskClientError("Яндекс.Диск: сетевая ошибка при обращении к API.", "network_error", {
      cause: e
    });
  }
}

async function postOAuthForm(
  body: URLSearchParams,
  oauthGrantType: "authorization_code" | "refresh_token"
): Promise<OAuthTokenJson> {
  let res: Response;
  try {
    res = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body
    });
  } catch (e) {
    throw new YandexDiskClientError("Яндекс.Диск: сетевая ошибка при обмене OAuth-токена.", "network_error", {
      cause: e,
      oauthGrantType
    });
  }

  const json = (await safeReadJson(res)) as OAuthTokenJson | null;
  if (!res.ok || !json || typeof json !== "object") {
    const oauthError = json && typeof json.error === "string" ? json.error : undefined;
    const rawDesc =
      json && typeof json.error_description === "string" ? json.error_description : undefined;
    throw new YandexDiskClientError(`Яндекс.Диск: ошибка OAuth (${res.status}).`, oauthErrorToCode(oauthError), {
      httpStatus: res.status,
      oauthError,
      oauthGrantType,
      rawProviderMessage: rawDesc
    });
  }

  if (typeof json.access_token !== "string" || typeof json.expires_in !== "number") {
    throw new YandexDiskClientError("Яндекс.Диск: неожиданный ответ OAuth.", "provider_error", {
      httpStatus: res.status,
      oauthGrantType
    });
  }

  return json;
}

/**
 * Обмен authorization code на access/refresh (первичное подключение).
 */
export async function exchangeAuthorizationCodeForTokens(code: string): Promise<YandexOAuthTokenBundle> {
  const env = getYandexDiskIntegrationEnv();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.oauthClientId,
    client_secret: env.oauthClientSecret,
    redirect_uri: env.oauthRedirectUri
  });
  const json = await postOAuthForm(body, "authorization_code");
  if (typeof json.refresh_token !== "string") {
    throw new YandexDiskClientError(
      "Яндекс.Диск: OAuth не вернул refresh_token.",
      "provider_error",
      { httpStatus: 200, oauthGrantType: "authorization_code" }
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresInSeconds: json.expires_in
  };
}

/**
 * Обновление access token; если refresh_token в ответе нет — используется переданный.
 */
export async function refreshAccessToken(refreshToken: string): Promise<YandexOAuthTokenBundle> {
  const env = getYandexDiskIntegrationEnv();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.oauthClientId,
    client_secret: env.oauthClientSecret
  });
  const json = await postOAuthForm(body, "refresh_token");
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : refreshToken,
    expiresInSeconds: json.expires_in
  };
}

/**
 * Профиль аккаунта Яндекса (id, login) для записи интеграции.
 */
export async function fetchLoginProfile(accessToken: string): Promise<YandexLoginProfile> {
  let res: Response;
  try {
    res = await fetch(`${LOGIN_INFO_URL}?format=json`, {
      headers: {
        Accept: "application/json",
        Authorization: `OAuth ${accessToken}`
      }
    });
  } catch (e) {
    throw new YandexDiskClientError("Яндекс.Диск: сетевая ошибка при запросе профиля.", "network_error", {
      cause: e
    });
  }
  const json = (await safeReadJson(res)) as Record<string, unknown> | null;
  if (!res.ok || !json || typeof json !== "object") {
    const code = diskStatusToCode(res.status);
    throw new YandexDiskClientError("login.yandex.ru: ошибка запроса профиля.", code, {
      httpStatus: res.status
    });
  }
  const id = json.id;
  const login = json.login;
  if (typeof id !== "string" || typeof login !== "string") {
    throw new YandexDiskClientError("Яндекс.Диск: неполный ответ профиля аккаунта.", "provider_error", {
      httpStatus: res.status
    });
  }
  const displayName = typeof json.display_name === "string" ? json.display_name : null;
  return { id, login, displayName };
}

/**
 * Метаданные ресурса (папка или файл). 404 → `null`.
 */
export async function getDiskResourceMeta(
  accessToken: string,
  path: string
): Promise<{ type: "file" | "dir" } | null> {
  const p = normalizeDiskPath(path);
  const q = new URLSearchParams({ path: p });
  const res = await fetchDisk(accessToken, `/resources?${q.toString()}`, { method: "GET" });
  const body = await safeReadJson(res);
  if (res.status === 404) return null;
  assertDiskError(res, body);
  const o = body && typeof body === "object" ? (body as { type?: string }) : {};
  if (o.type === "file" || o.type === "dir") {
    return { type: o.type };
  }
  throw new YandexDiskClientError("Яндекс.Диск: неожиданный ответ метаданных.", "provider_error", {
    httpStatus: res.status
  });
}

export async function diskResourceExists(accessToken: string, path: string): Promise<boolean> {
  const meta = await getDiskResourceMeta(accessToken, path);
  return meta !== null;
}

export type DiskDirectoryListItem = {
  path: string;
  type: "file" | "dir";
  name: string;
};

function normalizeDiskApiResourcePath(path: string): string {
  const t = path.trim();
  if (t.startsWith("disk:")) {
    const rest = t.slice("disk:".length).replace(/^\/+/, "");
    return normalizeDiskPath(`/${rest}`);
  }
  return normalizeDiskPath(t);
}

type DiskResourcesListJson = {
  type?: string;
  _embedded?: {
    items?: unknown[];
    total?: number;
    limit?: number;
    offset?: number;
  };
};

function parseDiskDirectoryItems(body: unknown): DiskDirectoryListItem[] {
  const o = body && typeof body === "object" ? (body as DiskResourcesListJson) : {};
  const raw = o._embedded?.items;
  if (!Array.isArray(raw)) return [];
  const out: DiskDirectoryListItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const r = it as { path?: unknown; type?: unknown; name?: unknown };
    if (typeof r.path !== "string" || (r.type !== "file" && r.type !== "dir") || typeof r.name !== "string") {
      continue;
    }
    out.push({
      path: normalizeDiskApiResourcePath(r.path),
      type: r.type,
      name: r.name
    });
  }
  return out;
}

/**
 * Постраничный листинг непосредственных детей каталога (файлы и подпапки).
 * Путь не существует → пустой массив; путь — файл → ошибка `bad_request`.
 */
export async function diskListDirectoryPage(
  accessToken: string,
  path: string,
  options?: { limit?: number; offset?: number }
): Promise<DiskDirectoryListItem[]> {
  const p = normalizeDiskPath(path);
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 1000);
  const offset = Math.max(options?.offset ?? 0, 0);
  const q = new URLSearchParams({
    path: p,
    limit: String(limit),
    offset: String(offset)
  });
  const res = await fetchDisk(accessToken, `/resources?${q.toString()}`, { method: "GET" });
  const body = await safeReadJson(res);
  if (res.status === 404) return [];
  assertDiskError(res, body);
  const o = body && typeof body === "object" ? (body as DiskResourcesListJson) : {};
  if (o.type === "file") {
    throw new YandexDiskClientError(
      `Яндекс.Диск: ожидалась папка для листинга, по пути «${p}» найден файл.`,
      "bad_request",
      { httpStatus: res.status }
    );
  }
  return parseDiskDirectoryItems(body);
}

/**
 * Все непосредственные дети каталога (с пагинацией по API Диска).
 */
export async function diskListDirectoryAll(
  accessToken: string,
  path: string
): Promise<DiskDirectoryListItem[]> {
  const pageSize = 200;
  const acc: DiskDirectoryListItem[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await diskListDirectoryPage(accessToken, path, { limit: pageSize, offset });
    if (page.length === 0) break;
    acc.push(...page);
    if (page.length < pageSize) break;
  }
  return acc;
}

/**
 * Создать папку по пути (один сегмент пути; родитель должен существовать).
 */
export async function diskCreateFolder(accessToken: string, path: string): Promise<void> {
  const p = normalizeDiskPath(path);
  const q = new URLSearchParams({ path: p });
  const res = await fetchDisk(accessToken, `/resources?${q.toString()}`, { method: "PUT" });
  const body = await safeReadJson(res);
  if (res.status === 201 || res.status === 200) return;
  if (res.status === 409) return;
  assertDiskError(res, body);
}

/**
 * Идемпотентно гарантировать папку: если нет — создать; если занято файлом — ошибка.
 */
export async function diskEnsureFolder(accessToken: string, path: string): Promise<void> {
  const p = normalizeDiskPath(path);
  const meta = await getDiskResourceMeta(accessToken, p);
  if (meta === null) {
    await diskCreateFolder(accessToken, p);
    return;
  }
  if (meta.type === "file") {
    throw new YandexDiskClientError(
      `Яндекс.Диск: путь «${p}» занят файлом, ожидалась папка.`,
      "already_exists",
      { httpStatus: 409 }
    );
  }
}

/**
 * Создать цепочку каталогов от корня (например `/doit/boards/<id>/cards`).
 */
export async function diskEnsureFolderChain(accessToken: string, absolutePath: string): Promise<void> {
  const full = normalizeDiskPath(absolutePath);
  const segments = full.split("/").filter(Boolean);
  let prefix = "";
  for (const seg of segments) {
    prefix = `${prefix}/${seg}`;
    await diskEnsureFolder(accessToken, prefix);
  }
}

export type DiskUploadLinkResult = {
  href: string;
  method: string;
};

export type DiskPutUploadResult = {
  /**
   * `true`, если uploader принял файл, но Яндекс ещё асинхронно переносит его в хранилище
   * (`202 Accepted`).
   */
  acceptedAsync: boolean;
};

/**
 * Ссылка для загрузки файла (PUT тело на `href`).
 */
export async function diskGetUploadLink(
  accessToken: string,
  path: string,
  options?: { overwrite?: boolean }
): Promise<DiskUploadLinkResult> {
  const p = normalizeDiskPath(path);
  const q = new URLSearchParams({
    path: p,
    overwrite: options?.overwrite === true ? "true" : "false"
  });
  const res = await fetchDisk(accessToken, `/resources/upload?${q.toString()}`, { method: "GET" });
  const body = await safeReadJson(res);
  assertDiskError(res, body);
  const o = body && typeof body === "object" ? (body as { href?: unknown; method?: unknown }) : {};
  if (typeof o.href !== "string" || typeof o.method !== "string") {
    throw new YandexDiskClientError("Яндекс.Диск: нет ссылки загрузки в ответе.", "provider_error", {
      httpStatus: res.status
    });
  }
  return { href: o.href, method: o.method };
}

/**
 * Ссылка для скачивания (временный URL; не кэшировать долго — спец. 11.3).
 * Отсутствие ресурса по пути — HTTP 404 или `DiskNotFoundError` → {@link YandexDiskClientError} с `code: "not_found"` (спец. 11.4).
 */
export async function diskGetDownloadLink(accessToken: string, path: string): Promise<string> {
  const p = normalizeDiskPath(path);
  const q = new URLSearchParams({ path: p });
  const res = await fetchDisk(accessToken, `/resources/download?${q.toString()}`, { method: "GET" });
  const body = await safeReadJson(res);
  assertDiskError(res, body);
  const o = body && typeof body === "object" ? (body as { href?: unknown }) : {};
  if (typeof o.href !== "string") {
    throw new YandexDiskClientError("Яндекс.Диск: нет ссылки скачивания в ответе.", "provider_error", {
      httpStatus: res.status
    });
  }
  return o.href;
}

/**
 * Удалить файл или папку на Диске.
 */
export async function diskDeleteResource(
  accessToken: string,
  path: string,
  options?: { permanently?: boolean }
): Promise<void> {
  const p = normalizeDiskPath(path);
  const q = new URLSearchParams({
    path: p,
    permanently: options?.permanently === true ? "true" : "false"
  });
  const res = await fetchDisk(accessToken, `/resources?${q.toString()}`, { method: "DELETE" });
  const body = await safeReadJson(res);
  if (res.status === 204 || res.status === 200) return;
  assertDiskError(res, body);
}

/**
 * PUT загрузки по `href` из `diskGetUploadLink` (отдельный хост, без заголовка OAuth).
 */
export async function diskPutUpload(
  uploadHref: string,
  body: Buffer | Uint8Array,
  init?: { contentType?: string }
): Promise<DiskPutUploadResult> {
  const payload: Uint8Array = Buffer.isBuffer(body) ? new Uint8Array(body) : body;
  const arrayBuffer = payload.buffer.slice(
    payload.byteOffset,
    payload.byteOffset + payload.byteLength
  ) as ArrayBuffer;
  let res: Response;
  try {
    res = await fetch(uploadHref, {
      method: "PUT",
      headers: {
        ...(init?.contentType ? { "Content-Type": init.contentType } : {})
      },
      body: new Blob([arrayBuffer], init?.contentType ? { type: init.contentType } : undefined)
    });
  } catch (e) {
    throw new YandexDiskClientError("Яндекс.Диск: сетевая ошибка при загрузке файла.", "network_error", {
      cause: e
    });
  }
  if (res.status === 201 || res.status === 200) {
    return { acceptedAsync: false };
  }
  if (res.status === 202) {
    return { acceptedAsync: true };
  }
  const parsed = await safeReadJson(res);
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    assertDiskError(res, parsed);
  }
  throw new YandexDiskClientError(
    `Яндекс.Диск: загрузка файла завершилась с кодом ${res.status}.`,
    diskStatusToCode(res.status),
    { httpStatus: res.status }
  );
}
