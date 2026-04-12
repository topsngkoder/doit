import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prepareOneCardAttachmentUpload } from "@/lib/yandex-disk/card-attachment-upload-pipeline";
import type { CardAttachmentPrepareUploadResult } from "@/lib/yandex-disk/card-attachment-upload-result-types";
import { ensureYandexDiskCardAttachmentFolder } from "@/lib/yandex-disk/ensure-yandex-disk-card-attachment-folder";
import {
  validateCardAttachmentUploadRequest,
  type CardAttachmentUploadFileMeta
} from "@/lib/yandex-disk/validate-card-attachment-upload-request";
import { YANDEX_DISK_MSG_AUTH_REQUIRED } from "@/lib/yandex-disk/yandex-disk-product-messages";

export const dynamic = "force-dynamic";

type PrepareUploadRequestBody = {
  field_definition_id?: unknown;
  file?: {
    name?: unknown;
    size?: unknown;
    type?: unknown;
  };
};

function parseFileMeta(body: PrepareUploadRequestBody): {
  fieldDefinitionId: string;
  fileMeta: CardAttachmentUploadFileMeta & { type?: string | null };
} | null {
  const fieldDefinitionId =
    typeof body.field_definition_id === "string" ? body.field_definition_id.trim() : "";
  const name = typeof body.file?.name === "string" ? body.file.name : "";
  const size = typeof body.file?.size === "number" ? body.file.size : Number.NaN;
  const type =
    typeof body.file?.type === "string" ?
      body.file.type
    : body.file?.type == null ? null
    : "";

  if (!fieldDefinitionId || !name || !Number.isFinite(size)) {
    return null;
  }

  return {
    fieldDefinitionId,
    fileMeta: { name, size, type }
  };
}

/**
 * Короткий подготовительный шаг direct upload: байты файла не проходят через приложение.
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
      { ok: false, message: YANDEX_DISK_MSG_AUTH_REQUIRED } satisfies CardAttachmentPrepareUploadResult,
      { status: 401 }
    );
  }

  let body: PrepareUploadRequestBody;
  try {
    body = (await request.json()) as PrepareUploadRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Некорректные данные запроса." } satisfies CardAttachmentPrepareUploadResult,
      { status: 400 }
    );
  }

  const parsed = parseFileMeta(body);
  if (!parsed) {
    return NextResponse.json(
      {
        ok: false,
        message: "Передайте `field_definition_id` и метаданные файла (`name`, `size`)."
      } satisfies CardAttachmentPrepareUploadResult,
      { status: 400 }
    );
  }

  const validated = await validateCardAttachmentUploadRequest(supabase, {
    boardId,
    cardId,
    fieldDefinitionId: parsed.fieldDefinitionId,
    files: [{ name: parsed.fileMeta.name, size: parsed.fileMeta.size }]
  });
  if (!validated.ok) {
    return NextResponse.json(validated satisfies CardAttachmentPrepareUploadResult, { status: 400 });
  }

  const folder = await ensureYandexDiskCardAttachmentFolder(boardId, cardId);
  if (!folder.ok) {
    return NextResponse.json(
      { ok: false, message: folder.message } satisfies CardAttachmentPrepareUploadResult,
      { status: 400 }
    );
  }

  const prepared = await prepareOneCardAttachmentUpload(
    supabase,
    userData.user.id,
    boardId,
    cardId,
    parsed.fieldDefinitionId,
    parsed.fileMeta
  );
  if (!prepared.ok) {
    return NextResponse.json(prepared satisfies CardAttachmentPrepareUploadResult, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: true,
      file: {
        attachmentId: prepared.prepared.attachmentId,
        uploadUrl: prepared.prepared.uploadUrl,
        uploadMethod: prepared.prepared.uploadMethod
      }
    } satisfies CardAttachmentPrepareUploadResult,
    { status: 200 }
  );
}
