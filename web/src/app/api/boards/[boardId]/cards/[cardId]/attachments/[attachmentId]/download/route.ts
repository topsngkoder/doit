import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildAttachmentContentDispositionHeader } from "@/lib/yandex-disk/attachment-download-content-disposition";
import { resolveCardAttachmentTemporaryDownloadUrl } from "@/lib/yandex-disk/resolve-card-attachment-temporary-download-url";
import { YANDEX_DISK_MSG_DOWNLOAD_FAILED } from "@/lib/yandex-disk/yandex-disk-product-messages";

/** Не кэшировать ответы маршрута: временный URL Яндекса одноразовый (спец. 11.3). */
const DOWNLOAD_ROUTE_CACHE_CONTROL =
  "private, no-store, no-cache, max-age=0, must-revalidate";

export const dynamic = "force-dynamic";

/** Прокси до 1 GiB на файл; как у POST upload (спец. 10.2). */
export const maxDuration = 800;

/**
 * Скачивание вложения карточки (YDB5.1, YDB5.2, YDB5.6, спец. 11.5): на каждый GET — новый временный URL у API Диска,
 * тело файла проксируется через приложение с `Content-Disposition` по `original_file_name` из БД (имя на Диске — UUID).
 * Обязательный query `field_definition_id` — вложение должно принадлежать этому полю `Яндекс диск`.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ boardId: string; cardId: string; attachmentId: string }> }
) {
  const { boardId, cardId, attachmentId } = await context.params;
  const fieldDefinitionId = new URL(request.url).searchParams.get("field_definition_id") ?? "";

  const supabase = await createSupabaseServerClient();
  const result = await resolveCardAttachmentTemporaryDownloadUrl(supabase, {
    boardId,
    cardId,
    attachmentId,
    fieldDefinitionId
  });

  const noStoreHeaders = { "Cache-Control": DOWNLOAD_ROUTE_CACHE_CONTROL, Pragma: "no-cache" as const };

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.httpStatus, headers: noStoreHeaders });
  }

  let upstream: Response;
  try {
    upstream = await fetch(result.temporaryUrl, { redirect: "follow", cache: "no-store" });
  } catch (e) {
    console.error("card attachment download upstream fetch:", e);
    return NextResponse.json(
      { message: YANDEX_DISK_MSG_DOWNLOAD_FAILED },
      { status: 502, headers: noStoreHeaders }
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { message: YANDEX_DISK_MSG_DOWNLOAD_FAILED },
      { status: upstream.status === 404 ? 404 : 502, headers: noStoreHeaders }
    );
  }

  const contentType =
    upstream.headers.get("content-type")?.split(";")[0]?.trim() ||
    result.mimeType ||
    "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");

  const outHeaders = new Headers(noStoreHeaders);
  outHeaders.set("Content-Type", contentType);
  outHeaders.set("Content-Disposition", buildAttachmentContentDispositionHeader(result.originalFileName));
  if (contentLength) {
    outHeaders.set("Content-Length", contentLength);
  }

  return new NextResponse(upstream.body, { status: 200, headers: outHeaders });
}
