"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  COLUMN_TYPES,
  type ColumnType
} from "./column-types";

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

export type BoardLabelCatalogResult =
  | { ok: true }
  | { ok: false; message: string };

function normalizeBoardLabelName(raw: string): string {
  return raw.trim();
}

function normalizeBoardLabelHexColor(raw: string): string | null {
  const s = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) {
    return s.toUpperCase();
  }
  return null;
}

export async function createBoardLabelAction(
  boardId: string,
  nameRaw: string,
  colorRaw: string
): Promise<BoardLabelCatalogResult> {
  const name = normalizeBoardLabelName(nameRaw);
  if (name.length < 1 || name.length > 30) {
    return { ok: false, message: "Название метки: от 1 до 30 символов." };
  }
  const color = normalizeBoardLabelHexColor(colorRaw);
  if (!color) {
    return { ok: false, message: "Некорректный цвет: нужен формат #RRGGBB." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { data: maxRow } = await supabase
    .from("labels")
    .select("position")
    .eq("board_id", boardId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxPos =
    maxRow?.position != null ? Number(maxRow.position) : 0;
  const nextPos = Number.isFinite(maxPos) ? maxPos + 1 : 1;

  const { error } = await supabase.from("labels").insert({
    board_id: boardId,
    name,
    color,
    position: nextPos
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: "Метка с таким названием уже есть на этой доске."
      };
    }
    if (error.code === "42501") {
      return { ok: false, message: "Нет права управлять метками доски." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

export async function deleteBoardLabelAction(
  boardId: string,
  labelId: string
): Promise<BoardLabelCatalogResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { data: row, error: readError } = await supabase
    .from("labels")
    .select("id, board_id")
    .eq("id", labelId)
    .maybeSingle();

  if (readError) {
    return { ok: false, message: readError.message };
  }
  if (!row || row.board_id !== boardId) {
    return { ok: false, message: "Метка не найдена на этой доске." };
  }

  const { error } = await supabase.from("labels").delete().eq("id", labelId);

  if (error) {
    if (error.code === "42501") {
      return { ok: false, message: "Нет права управлять метками доски." };
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

export type ColumnMutationResult = { ok: true } | { ok: false; message: string };

function isColumnType(v: string): v is ColumnType {
  return (COLUMN_TYPES as readonly string[]).includes(v);
}

export async function createBoardColumnAction(
  boardId: string,
  _prev: ColumnMutationResult | undefined,
  formData: FormData
): Promise<ColumnMutationResult> {
  const nameRaw = formData.get("name");
  const typeRaw = formData.get("column_type");
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const columnType = typeof typeRaw === "string" ? typeRaw.trim() : "";

  if (!name) {
    return { ok: false, message: "Укажите название колонки." };
  }
  if (name.length > 50) {
    return { ok: false, message: "Название не длиннее 50 символов." };
  }
  if (!isColumnType(columnType)) {
    return { ok: false, message: "Выберите тип колонки." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { data: maxRow, error: maxError } = await supabase
    .from("board_columns")
    .select("position")
    .eq("board_id", boardId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxError) {
    return { ok: false, message: maxError.message };
  }

  const nextPosition = maxRow?.position != null ? Number(maxRow.position) + 1 : 0;

  const { error } = await supabase.from("board_columns").insert({
    board_id: boardId,
    name,
    column_type: columnType,
    position: nextPosition
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, message: "Нет права создавать колонки на этой доске." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

export async function updateBoardColumnAction(
  boardId: string,
  columnId: string,
  _prev: ColumnMutationResult | undefined,
  formData: FormData
): Promise<ColumnMutationResult> {
  const nameRaw = formData.get("name");
  const typeRaw = formData.get("column_type");
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  const columnType = typeof typeRaw === "string" ? typeRaw.trim() : "";

  if (!name) {
    return { ok: false, message: "Укажите название колонки." };
  }
  if (name.length > 50) {
    return { ok: false, message: "Название не длиннее 50 символов." };
  }
  if (!isColumnType(columnType)) {
    return { ok: false, message: "Выберите тип колонки." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { error } = await supabase
    .from("board_columns")
    .update({ name, column_type: columnType })
    .eq("board_id", boardId)
    .eq("id", columnId);

  if (error) {
    if (error.code === "42501") {
      return { ok: false, message: "Нет права переименовывать или менять тип колонки." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

export async function moveBoardColumnAction(
  boardId: string,
  columnId: string,
  direction: "left" | "right"
): Promise<ColumnMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { data: rows, error: listError } = await supabase
    .from("board_columns")
    .select("id, position")
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  if (listError) {
    return { ok: false, message: listError.message };
  }

  const cols = rows ?? [];
  const idx = cols.findIndex((c) => c.id === columnId);
  if (idx === -1) {
    return { ok: false, message: "Колонка не найдена." };
  }

  const swapIdx = direction === "left" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= cols.length) {
    return { ok: true };
  }

  const a = cols[idx];
  const b = cols[swapIdx];
  const posA = Number(a.position);
  const posB = Number(b.position);

  const { error: e1 } = await supabase
    .from("board_columns")
    .update({ position: posB })
    .eq("id", a.id)
    .eq("board_id", boardId);

  if (e1) {
    if (e1.code === "42501") {
      return { ok: false, message: "Нет права менять порядок колонок." };
    }
    return { ok: false, message: e1.message };
  }

  const { error: e2 } = await supabase
    .from("board_columns")
    .update({ position: posA })
    .eq("id", b.id)
    .eq("board_id", boardId);

  if (e2) {
    await supabase.from("board_columns").update({ position: posA }).eq("id", a.id).eq("board_id", boardId);
    if (e2.code === "42501") {
      return { ok: false, message: "Нет права менять порядок колонок." };
    }
    return { ok: false, message: e2.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

/** Устанавливает порядок колонок по массиву id (полная перестановка той же множества, что в БД). */
export async function reorderBoardColumnsAction(
  boardId: string,
  orderedColumnIds: string[]
): Promise<ColumnMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  if (!Array.isArray(orderedColumnIds) || orderedColumnIds.length === 0) {
    return { ok: false, message: "Укажите порядок колонок." };
  }

  const { data: rows, error: listError } = await supabase
    .from("board_columns")
    .select("id")
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  if (listError) {
    return { ok: false, message: listError.message };
  }

  const existingIds = (rows ?? []).map((r) => r.id).sort();
  const argSorted = [...orderedColumnIds].sort();
  if (
    existingIds.length !== argSorted.length ||
    !existingIds.every((id, i) => id === argSorted[i])
  ) {
    return { ok: false, message: "Состав колонок не совпадает с доской." };
  }

  for (let i = 0; i < orderedColumnIds.length; i++) {
    const { error } = await supabase
      .from("board_columns")
      .update({ position: i })
      .eq("id", orderedColumnIds[i])
      .eq("board_id", boardId);

    if (error) {
      if (error.code === "42501") {
        return { ok: false, message: "Нет права менять порядок колонок." };
      }
      return { ok: false, message: error.message };
    }
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

export async function deleteBoardColumnAction(
  boardId: string,
  columnId: string
): Promise<ColumnMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { error } = await supabase
    .from("board_columns")
    .delete()
    .eq("board_id", boardId)
    .eq("id", columnId);

  if (error) {
    if (error.code === "42501") {
      return { ok: false, message: "Нет права удалять колонки." };
    }
    if (error.code === "23503") {
      return {
        ok: false,
        message:
          "В колонке есть карточки. Перенесите или удалите их, затем повторите удаление колонки."
      };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

export type CreateCardFieldValuePayload = {
  field_definition_id: string;
  text_value?: string;
  date_value?: string;
  link_url?: string;
  link_text?: string;
  select_option_id?: string;
};

export type CreateCardResult =
  | { ok: true; cardId: string }
  | { ok: false; message: string };

export async function createCardAction(
  boardId: string,
  payload: {
    columnId: string;
    title: string;
    assigneeUserIds: string[];
    fieldValues: CreateCardFieldValuePayload[];
  }
): Promise<CreateCardResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const title = payload.title.trim();
  if (!title) {
    return { ok: false, message: "Укажите название карточки." };
  }
  if (title.length > 200) {
    return { ok: false, message: "Название не длиннее 200 символов." };
  }

  const assignees = [...new Set(payload.assigneeUserIds)];
  if (assignees.length < 1) {
    return { ok: false, message: "Выберите хотя бы одного участника карточки." };
  }

  const { data: cardId, error } = await supabase.rpc("create_card_with_details", {
    p_board_id: boardId,
    p_column_id: payload.columnId,
    p_title: title,
    p_assignee_user_ids: assignees,
    p_field_values: payload.fieldValues
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const id = typeof cardId === "string" ? cardId : null;
  if (!id) {
    return { ok: false, message: "Не удалось создать карточку." };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true, cardId: id };
}

export async function mutateCardAssigneeAction(
  boardId: string,
  cardId: string,
  assigneeUserId: string,
  add: boolean
): Promise<CardMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { data: row, error: fetchError } = await supabase
    .from("cards")
    .select("board_id")
    .eq("id", cardId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, message: fetchError.message };
  }
  if (!row || row.board_id !== boardId) {
    return { ok: false, message: "Карточка не найдена на этой доске." };
  }

  const { error } = await supabase.rpc("mutate_card_assignee", {
    p_card_id: cardId,
    p_assignee_user_id: assigneeUserId,
    p_add: add
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, message: "Нет права менять участников этой карточки." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

export async function mutateCardLabelAction(
  boardId: string,
  cardId: string,
  labelId: string,
  add: boolean
): Promise<CardMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { data: row, error: fetchError } = await supabase
    .from("cards")
    .select("board_id")
    .eq("id", cardId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, message: fetchError.message };
  }
  if (!row || row.board_id !== boardId) {
    return { ok: false, message: "Карточка не найдена на этой доске." };
  }

  const { error } = await supabase.rpc("mutate_card_label", {
    p_card_id: cardId,
    p_label_id: labelId,
    p_add: add
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, message: "Нет права менять метки этой карточки." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

export async function setCardResponsibleAction(
  boardId: string,
  cardId: string,
  responsibleUserId: string
): Promise<CardMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { data: row, error: fetchError } = await supabase
    .from("cards")
    .select("board_id")
    .eq("id", cardId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, message: fetchError.message };
  }
  if (!row || row.board_id !== boardId) {
    return { ok: false, message: "Карточка не найдена на этой доске." };
  }

  const { error } = await supabase.rpc("set_card_responsible_user", {
    p_card_id: cardId,
    p_responsible_user_id: responsibleUserId
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, message: "Нет права назначать ответственного на этой карточке." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

export type BoardCardsLayoutPayload = { column_id: string; card_ids: string[] }[];

export async function reorderBoardCardsAction(
  boardId: string,
  layout: BoardCardsLayoutPayload
): Promise<ColumnMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  if (!Array.isArray(layout) || layout.length < 1) {
    return { ok: false, message: "Некорректный порядок карточек." };
  }

  const { error } = await supabase.rpc("reorder_board_cards", {
    p_board_id: boardId,
    p_layout: layout
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, message: "Нет права перемещать карточки на этой доске." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

const MAX_CARD_DESCRIPTION_LENGTH = 50_000;

export type CardMutationResult = { ok: true } | { ok: false; message: string };

export async function updateCardAction(
  boardId: string,
  cardId: string,
  payload: { title: string; description: string }
): Promise<CardMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const title = payload.title.trim();
  if (title.length < 1 || title.length > 200) {
    return { ok: false, message: "Название: от 1 до 200 символов." };
  }

  const description = payload.description ?? "";
  if (description.length > MAX_CARD_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      message: `Описание не длиннее ${MAX_CARD_DESCRIPTION_LENGTH} символов.`
    };
  }

  const { data: row, error: fetchError } = await supabase
    .from("cards")
    .select("id, board_id, title, description")
    .eq("id", cardId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, message: fetchError.message };
  }
  if (!row || row.board_id !== boardId) {
    return { ok: false, message: "Карточка не найдена на этой доске." };
  }

  const titleChanged = row.title !== title;
  const descChanged = row.description !== description;
  if (!titleChanged && !descChanged) {
    return { ok: true };
  }

  const { error: updateError } = await supabase
    .from("cards")
    .update({ title, description })
    .eq("id", cardId)
    .eq("board_id", boardId);

  if (updateError) {
    if (updateError.code === "42501") {
      return { ok: false, message: "Нет права редактировать эту карточку." };
    }
    if (updateError.message.includes("cards.move allows only")) {
      return {
        ok: false,
        message:
          "Недостаточно прав на изменение названия или описания (есть только перенос карточки)."
      };
    }
    if (updateError.message.includes("not permitted to update card")) {
      return { ok: false, message: "Нет права редактировать эту карточку." };
    }
    return { ok: false, message: updateError.message };
  }

  if (titleChanged) {
    const { error: actErr } = await supabase.from("card_activity").insert({
      card_id: cardId,
      actor_user_id: user.id,
      activity_type: "card_renamed",
      message: "Переименована карточка",
      payload: { previous_title: row.title, title }
    });
    if (actErr) {
      return { ok: false, message: `Карточка обновлена, но не удалось записать историю: ${actErr.message}` };
    }
  }

  if (descChanged) {
    const { error: actErr } = await supabase.from("card_activity").insert({
      card_id: cardId,
      actor_user_id: user.id,
      activity_type: "description_updated",
      message: "Изменено описание",
      payload: {}
    });
    if (actErr) {
      return { ok: false, message: `Карточка обновлена, но не удалось записать историю: ${actErr.message}` };
    }
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

export async function updateCardBodyAndCustomFieldsAction(
  boardId: string,
  cardId: string,
  payload: {
    title: string;
    description: string;
    fieldValues: CreateCardFieldValuePayload[];
  }
): Promise<CardMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const title = payload.title.trim();
  if (title.length < 1 || title.length > 200) {
    return { ok: false, message: "Название: от 1 до 200 символов." };
  }

  const description = payload.description ?? "";
  if (description.length > MAX_CARD_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      message: `Описание не длиннее ${MAX_CARD_DESCRIPTION_LENGTH} символов.`
    };
  }

  const { data: row, error: fetchError } = await supabase
    .from("cards")
    .select("id, board_id")
    .eq("id", cardId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, message: fetchError.message };
  }
  if (!row || row.board_id !== boardId) {
    return { ok: false, message: "Карточка не найдена на этой доске." };
  }

  const { error } = await supabase.rpc("update_card_body_and_custom_fields", {
    p_card_id: cardId,
    p_title: title,
    p_description: description,
    p_field_values: payload.fieldValues
  });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, message: "Нет права редактировать эту карточку." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}

export async function deleteCardAction(
  boardId: string,
  cardId: string
): Promise<CardMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Нужна авторизация." };
  }

  const { data: row, error: fetchError } = await supabase
    .from("cards")
    .select("board_id")
    .eq("id", cardId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, message: fetchError.message };
  }
  if (!row || row.board_id !== boardId) {
    return { ok: false, message: "Карточка не найдена на этой доске." };
  }

  const { error } = await supabase.from("cards").delete().eq("id", cardId).eq("board_id", boardId);

  if (error) {
    if (error.code === "42501") {
      return { ok: false, message: "Нет права удалять эту карточку." };
    }
    return { ok: false, message: error.message };
  }

  revalidatePath(`/boards/${boardId}`);
  return { ok: true };
}
