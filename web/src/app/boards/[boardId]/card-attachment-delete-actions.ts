"use server";

import { revalidatePath } from "next/cache";

import { normalizeUuidParam } from "@/lib/board-id-param";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deleteCardAttachment,
  type DeleteCardAttachmentResult
} from "@/lib/yandex-disk/delete-card-attachment";
import {
  YANDEX_DISK_TECH_NOTIFY_DELETE_ATTACHMENT_BODY_INTRO,
  YANDEX_DISK_TECH_NOTIFY_DELETE_ATTACHMENT_TITLE
} from "@/lib/yandex-disk/yandex-disk-product-messages";

export type { DeleteCardAttachmentResult };

/** YDB5.4 / YDB5.6: удаление одного `ready`-вложения в разрезе поля (Диск → БД; отсутствие файла на Диске — успех). */
export async function deleteCardAttachmentAction(
  boardId: string,
  cardId: string,
  attachmentId: string,
  fieldDefinitionId: string
): Promise<DeleteCardAttachmentResult> {
  const supabase = await createSupabaseServerClient();
  const result = await deleteCardAttachment(supabase, {
    boardId,
    cardId,
    attachmentId,
    fieldDefinitionId
  });
  if (result.ok) {
    revalidatePath(`/boards/${boardId}`);
    return result;
  }

  const bId = normalizeUuidParam(boardId);
  const cId = normalizeUuidParam(cardId);
  const body = `${YANDEX_DISK_TECH_NOTIFY_DELETE_ATTACHMENT_BODY_INTRO}\n\n${result.message}`.slice(
    0,
    8000
  );
  const linkPath = bId ? `/boards/${bId}` : "/boards";
  const { error: notifyError } = await supabase.rpc("enqueue_technical_notification", {
    p_title: YANDEX_DISK_TECH_NOTIFY_DELETE_ATTACHMENT_TITLE,
    p_body: body,
    p_link_url: linkPath,
    p_board_id: bId,
    p_card_id: cId
  });
  if (notifyError) {
    console.error("enqueue_technical_notification (delete attachment):", notifyError.message);
  }

  return result;
}
