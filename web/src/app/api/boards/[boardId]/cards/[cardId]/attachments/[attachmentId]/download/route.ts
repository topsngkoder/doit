import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCardAttachmentTemporaryDownloadUrl } from "@/lib/yandex-disk/resolve-card-attachment-temporary-download-url";

/** Не кэшировать ответы маршрута: временный URL Яндекса одноразовый (спец. 11.3). */
const DOWNLOAD_ROUTE_CACHE_CONTROL =
  "private, no-store, no-cache, max-age=0, must-revalidate";

export const dynamic = "force-dynamic";

/**
 * Скачивание вложения карточки через временный URL Яндекса (YDB5.1, YDB5.2, YDB5.6).
 * GET — редирект 302 на ссылку провайдера; каждый запрос получает новый URL, без кэша ответа.
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

  return NextResponse.redirect(result.temporaryUrl, { status: 302, headers: noStoreHeaders });
}
