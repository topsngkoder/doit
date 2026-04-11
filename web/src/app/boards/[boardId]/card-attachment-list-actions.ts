"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listReadyCardAttachmentsForViewer,
  type CardAttachmentReadyListItem,
  type ListReadyCardAttachmentsResult
} from "@/lib/yandex-disk/list-card-attachments";

export type { CardAttachmentReadyListItem, ListReadyCardAttachmentsResult };

/** YDB4.6: список `ready`-вложений для UI; `uploading`/`failed` отсекаются RLS и явным фильтром. */
export async function listReadyCardAttachmentsAction(
  boardId: string,
  cardId: string
): Promise<ListReadyCardAttachmentsResult> {
  const supabase = await createSupabaseServerClient();
  return listReadyCardAttachmentsForViewer(supabase, { boardId, cardId });
}
