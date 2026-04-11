"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deleteCardAttachment,
  type DeleteCardAttachmentResult
} from "@/lib/yandex-disk/delete-card-attachment";

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
  }
  return result;
}
