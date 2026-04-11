import "server-only";

/** Одна строка JSON в stdout — удобно для Vercel/CloudWatch без раскрытия токенов. */
export type YandexDiskCleanupLogFields = Record<
  string,
  string | number | boolean | null | undefined
>;

export function logYandexDiskCleanup(
  level: "info" | "warn" | "error",
  event: string,
  fields: YandexDiskCleanupLogFields = {}
): void {
  const line = JSON.stringify({
    scope: "yandex_disk_cleanup",
    event,
    ...fields
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function yandexDiskClientErrorFields(
  e: unknown
): { client_error_code?: string; client_http_status?: number } {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && code) {
      const out: { client_error_code: string; client_http_status?: number } = {
        client_error_code: code
      };
      if ("httpStatus" in e) {
        const s = (e as { httpStatus?: unknown }).httpStatus;
        if (typeof s === "number" && Number.isFinite(s)) {
          out.client_http_status = s;
        }
      }
      return out;
    }
  }
  return {};
}
