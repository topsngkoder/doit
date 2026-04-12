import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { failOneCardAttachmentUpload } from "@/lib/yandex-disk/card-attachment-upload-pipeline";
import type { CardAttachmentFailUploadResult } from "@/lib/yandex-disk/card-attachment-upload-result-types";
import { YANDEX_DISK_MSG_AUTH_REQUIRED } from "@/lib/yandex-disk/yandex-disk-product-messages";

export const dynamic = "force-dynamic";

type FailUploadRequestBody = {
  field_definition_id?: unknown;
  attachment_id?: unknown;
};

function parseIds(
  body: FailUploadRequestBody
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
 * Best-effort recovery direct upload: если клиент не смог загрузить байты в Яндекс или отменил загрузку,
 * помечаем запись `uploading -> failed`, чтобы не оставлять её "висящей".
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
      { ok: false, message: YANDEX_DISK_MSG_AUTH_REQUIRED } satisfies CardAttachmentFailUploadResult,
      { status: 401 }
    );
  }

  let body: FailUploadRequestBody;
  try {
    body = (await request.json()) as FailUploadRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Некорректные данные запроса." } satisfies CardAttachmentFailUploadResult,
      { status: 400 }
    );
  }

  const parsed = parseIds(body);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, message: "Передайте `field_definition_id` и `attachment_id`." } satisfies CardAttachmentFailUploadResult,
      { status: 400 }
    );
  }

  const result = await failOneCardAttachmentUpload(
    supabase,
    userData.user.id,
    boardId,
    cardId,
    parsed.fieldDefinitionId,
    parsed.attachmentId
  );

  const status = result.ok ? 200 : 400;
  return NextResponse.json(result satisfies CardAttachmentFailUploadResult, { status });
}

