"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InviteBoardMemberResult =
  | { ok: true }
  | { ok: false; message: string };

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function inviteBoardMemberAction(
  boardId: string,
  _prev: InviteBoardMemberResult | undefined,
  formData: FormData
): Promise<InviteBoardMemberResult> {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? normalizeEmail(raw) : "";
  if (!email) {
    return { ok: false, message: "Укажите email." };
  }
  if (email.length > 320) {
    return { ok: false, message: "Email слишком длинный." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { error } = await supabase.from("board_invites").insert({
    board_id: boardId,
    email,
    invited_by_user_id: user.id,
    status: "pending"
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message:
          "Для этого адреса уже есть активное приглашение на эту доску (один pending на email)."
      };
    }
    if (error.code === "42501") {
      return { ok: false, message: "Нет права приглашать участников на эту доску." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

export type UpdateBoardMemberRoleResult =
  | { ok: true }
  | { ok: false; message: string };

export async function updateBoardMemberRoleAction(
  boardId: string,
  memberUserId: string,
  boardRoleId: string
): Promise<UpdateBoardMemberRoleResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { data: row, error: readError } = await supabase
    .from("board_members")
    .select("is_owner")
    .eq("board_id", boardId)
    .eq("user_id", memberUserId)
    .maybeSingle();

  if (readError) {
    return { ok: false, message: readError.message };
  }
  if (!row) {
    return { ok: false, message: "Участник не найден на доске." };
  }
  if (row.is_owner) {
    return { ok: false, message: "Роль владельца доски нельзя менять." };
  }

  const { data: roleOk, error: roleError } = await supabase
    .from("board_roles")
    .select("id")
    .eq("id", boardRoleId)
    .eq("board_id", boardId)
    .maybeSingle();

  if (roleError) {
    return { ok: false, message: roleError.message };
  }
  if (!roleOk) {
    return { ok: false, message: "Роль не относится к этой доске." };
  }

  const { error: updateError } = await supabase
    .from("board_members")
    .update({ board_role_id: boardRoleId })
    .eq("board_id", boardId)
    .eq("user_id", memberUserId);

  if (updateError) {
    if (updateError.code === "42501") {
      return { ok: false, message: "Нет права назначать роли участникам." };
    }
    if (updateError.message.includes("cannot change board role for board owner")) {
      return { ok: false, message: "Роль владельца доски нельзя менять." };
    }
    if (updateError.message.includes("board_members update may only change board_role_id")) {
      return { ok: false, message: "Недопустимое изменение участника." };
    }
    return { ok: false, message: updateError.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}
