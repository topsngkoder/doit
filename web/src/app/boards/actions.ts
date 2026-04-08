"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidateBoardsData } from "./revalidation";

const DEFAULT_BOARD_ACCESS_ERROR =
  "Не удалось установить доску по умолчанию. Нет доступа к этой доске.";
const DEFAULT_BOARD_SAVE_ERROR =
  "Не удалось сохранить доску по умолчанию. Повторите попытку.";
const RENAME_BOARD_EMPTY_ERROR = "Укажите название доски.";
const RENAME_BOARD_TOO_LONG_ERROR = "Название не длиннее 100 символов.";
const RENAME_BOARD_ACCESS_ERROR = "Нет права переименовывать эту доску.";
const RENAME_BOARD_SAVE_ERROR = "Не удалось переименовать доску. Повторите попытку.";

export async function createBoardWithDefaultsAction(formData: FormData) {
  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) {
    redirect(
      "/boards?boardError=" + encodeURIComponent("Укажите название доски")
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_board_with_defaults", {
    p_name: name
  });

  if (error) {
    redirect("/boards?boardError=" + encodeURIComponent(error.message));
  }

  await revalidateBoardsData();
  redirect("/boards");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isDefaultBoardAccessError(error: { code?: string; message?: string }) {
  if (error.code === "42501") {
    return true;
  }
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("violates row-level security policy")
  );
}

function isPermissionError(error: { code?: string; message?: string }) {
  if (error.code === "42501") {
    return true;
  }
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("violates row-level security policy")
  );
}

export async function setDefaultBoardAction(defaultBoardId: string | null) {
  if (defaultBoardId !== null && !isUuid(defaultBoardId)) {
    return {
      ok: false as const,
      error: DEFAULT_BOARD_SAVE_ERROR
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      error: DEFAULT_BOARD_SAVE_ERROR
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ default_board_id: defaultBoardId })
    .eq("user_id", user.id);

  if (error) {
    return {
      ok: false as const,
      error: isDefaultBoardAccessError(error)
        ? DEFAULT_BOARD_ACCESS_ERROR
        : DEFAULT_BOARD_SAVE_ERROR
    };
  }

  await revalidateBoardsData();
  return { ok: true as const };
}

export async function renameBoardAction(boardId: string, name: string) {
  const trimmedName = name.trim();
  if (!isUuid(boardId)) {
    return {
      ok: false as const,
      error: RENAME_BOARD_SAVE_ERROR
    };
  }

  if (!trimmedName) {
    return {
      ok: false as const,
      error: RENAME_BOARD_EMPTY_ERROR
    };
  }

  if (trimmedName.length > 100) {
    return {
      ok: false as const,
      error: RENAME_BOARD_TOO_LONG_ERROR
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("boards")
    .update({ name: trimmedName })
    .eq("id", boardId);

  if (error) {
    return {
      ok: false as const,
      error: isPermissionError(error)
        ? RENAME_BOARD_ACCESS_ERROR
        : RENAME_BOARD_SAVE_ERROR
    };
  }

  await revalidateBoardsData();
  return { ok: true as const };
}
