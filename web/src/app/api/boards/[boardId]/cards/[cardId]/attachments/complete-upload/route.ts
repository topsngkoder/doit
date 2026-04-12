import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { completeOneCardAttachmentUpload } from "@/lib/yandex-disk/card-attachment-upload-pipeline";
import type { CardAttachmentCompleteUploadResult } from "@/lib/yandex-disk/card-attachment-upload-result-types";
import { YANDEX_DISK_MSG_AUTH_REQUIRED } from "@/lib/yandex-disk/yandex-disk-product-messages";

export const dynamic = "force-dynamic";

type CompleteUploadRequestBody = {
  field_definition_id?: unknown;
  attachment_id?: unknown;
};

function parseIds(
  body: CompleteUploadRequestBody
): { fieldDefinitionId: string; attachmentId: string } | null {
  const fieldDefinitionId =
    typeof body.field_definition_id === "string" ? body.field_definition_id.trim() : "";
  const attachmentId = typeof body.attachment_id === "string" ? body.attachment_id.trim() : "";
  if (!fieldDefinitionId || !attachmentId) {
    return null;
  }
  return { fieldDefinitionId, attachmentId };
}

/**
 * Короткий завершающий шаг direct upload (YDB4.9): байты файла уже отправлены напрямую в Яндекс.Диск,
 * а сервер проверяет факт наличия файла и переводит запись `uploading -> ready`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ boardId: string; cardId: string }> }
) {
  const { boardId, cardId } = await context.params;
  const supabase = await createSupabaseServerClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json(
      { ok: false, message: YANDEX_DISK_MSG_AUTH_REQUIRED } satisfies CardAttachmentCompleteUploadResult,
      { status: 401 }
    );
  }

  let body: CompleteUploadRequestBody;
  try {
    body = (await request.json()) as CompleteUploadRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Некорректные данные запроса." } satisfies CardAttachmentCompleteUploadResult,
      { status: 400 }
    );
  }

  const parsed = parseIds(body);
  if (!parsed) {
    return NextResponse.json(
      {
        ok: false,
        message: "Передайте `field_definition_id` и `attachment_id`."
      } satisfies CardAttachmentCompleteUploadResult,
      { status: 400 }
    );
  }

  const result = await completeOneCardAttachmentUpload(
    supabase,
    userData.user.id,
    boardId,
    cardId,
    parsed.fieldDefinitionId,
    parsed.attachmentId
  );

  if (result.ok) {
    return NextResponse.json(result satisfies CardAttachmentCompleteUploadResult, { status: 200 });
  }

  const status = result.retryable ? 409 : 400;
  return NextResponse.json(result satisfies CardAttachmentCompleteUploadResult, { status });
}

