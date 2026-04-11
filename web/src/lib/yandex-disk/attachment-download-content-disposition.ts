import "server-only";

/**
 * Заголовок `Content-Disposition: attachment` с исходным именем файла (RFC 5987 `filename*` для Unicode).
 * Убирает CR/LF, чтобы исключить подмену заголовков.
 */
export function buildAttachmentContentDispositionHeader(originalFileName: string): string {
  const trimmed = originalFileName.trim().replace(/[\r\n\x00]/g, "");
  const base = trimmed.length > 0 ? trimmed : "download";
  const asciiFallback =
    base
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/[";\\]/g, "_")
      .slice(0, 200) || "download";
  const encoded = encodeURIComponent(base.slice(0, 512));
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
