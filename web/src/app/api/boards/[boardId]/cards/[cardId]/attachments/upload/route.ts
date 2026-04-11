import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runCardAttachmentUpload } from "@/lib/yandex-disk/card-attachment-upload-runner";
import type { CardAttachmentUploadActionResult } from "@/lib/yandex-disk/card-attachment-upload-result-types";
import { YANDEX_DISK_MSG_AUTH_REQUIRED } from "@/lib/yandex-disk/yandex-disk-product-messages";

export const dynamic = "force-dynamic";

/** Hobby Vercel допускает максимум 300 с на Serverless Function. */
export const maxDuration = 300;

/**
 * POST multipart: `field_definition_id` (string), `files` — один `File` за запрос (YDB8.7: прогресс XHR).
 * Несколько файлов в одном запросе допустимо для совместимости, но UI шлёт по одному для `upload.onprogress`.
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
      { ok: false, message: YANDEX_DISK_MSG_AUTH_REQUIRED } satisfies CardAttachmentUploadActionResult,
      { status: 401 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Некорректные данные формы." } satisfies CardAttachmentUploadActionResult,
      { status: 400 }
    );
  }

  const fieldDefinitionId = String(formData.get("field_definition_id") ?? "").trim();
  const raw = formData.getAll("files");
  const files = raw.filter((x): x is File => x instanceof File);

  if (!fieldDefinitionId) {
    return NextResponse.json(
      { ok: false, message: "Не указано поле вложения." } satisfies CardAttachmentUploadActionResult,
      { status: 400 }
    );
  }

  if (files.length === 0) {
    return NextResponse.json(
      { ok: false, message: "Файлы не переданы." } satisfies CardAttachmentUploadActionResult,
      { status: 400 }
    );
  }

  const result = await runCardAttachmentUpload(
    supabase,
    userData.user.id,
    boardId,
    cardId,
    fieldDefinitionId,
    files
  );

  if (result.ok && result.files.some((r) => r.ok)) {
    revalidatePath(`/boards/${boardId}`);
  }

  const status = !result.ok ? 400 : 200;
  return NextResponse.json(result satisfies CardAttachmentUploadActionResult, { status });
}
