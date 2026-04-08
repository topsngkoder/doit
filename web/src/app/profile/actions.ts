"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UpdateProfileInput = {
  firstName: string;
  lastName: string;
  position?: string | null;
  department?: string | null;
};

export type UpdateProfileResult = { ok: true } | { ok: false; message: string };
export type AvatarMutationResult = { ok: true } | { ok: false; message: string };

const AVATARS_BUCKET = "avatars";
const AVATAR_OBJECT_NAME = "avatar.jpg";
const MAX_AVATAR_FILE_BYTES = 102_400;

function normalizeRequired(raw: string): string {
  return raw.trim();
}

function normalizeOptional(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

async function hasJpegSignature(file: File): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return header.length >= 2 && header[0] === 0xff && header[1] === 0xd8;
}

export async function updateProfileAction(
  input: UpdateProfileInput
): Promise<UpdateProfileResult> {
  const firstName = normalizeRequired(input.firstName);
  const lastName = normalizeRequired(input.lastName);
  const position = normalizeOptional(input.position);
  const department = normalizeOptional(input.department);

  if (!firstName) {
    return { ok: false, message: "Заполните имя" };
  }
  if (!lastName) {
    return { ok: false, message: "Заполните фамилию" };
  }
  if (firstName.length < 1 || firstName.length > 50) {
    return { ok: false, message: "Имя должно быть от 1 до 50 символов" };
  }
  if (lastName.length < 1 || lastName.length > 50) {
    return { ok: false, message: "Фамилия должна быть от 1 до 50 символов" };
  }
  if (position !== null && (position.length < 1 || position.length > 100)) {
    return { ok: false, message: "Должность должна быть от 1 до 100 символов" };
  }
  if (department !== null && (department.length < 1 || department.length > 100)) {
    return { ok: false, message: "Отдел должен быть от 1 до 100 символов" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, message: "Не удалось сохранить профиль. Повторите попытку" };
  }

  const displayName = `${firstName} ${lastName}`.trim();
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      position,
      department,
      display_name: displayName
    })
    .eq("user_id", user.id);

  if (updateError) {
    return { ok: false, message: "Не удалось сохранить профиль. Повторите попытку" };
  }

  revalidatePath("/profile");
  return { ok: true };
}

export async function uploadAvatarAction(
  normalizedJpegFile: File
): Promise<AvatarMutationResult> {
  if (!(normalizedJpegFile instanceof File)) {
    return { ok: false, message: "Не удалось загрузить аватар. Повторите попытку" };
  }
  if (normalizedJpegFile.size <= 0 || normalizedJpegFile.size > MAX_AVATAR_FILE_BYTES) {
    return { ok: false, message: "Не удалось загрузить аватар. Повторите попытку" };
  }
  if (normalizedJpegFile.type !== "image/jpeg") {
    return { ok: false, message: "Не удалось загрузить аватар. Повторите попытку" };
  }
  if (!(await hasJpegSignature(normalizedJpegFile))) {
    return { ok: false, message: "Не удалось загрузить аватар. Повторите попытку" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, message: "Не удалось загрузить аватар. Повторите попытку" };
  }

  const avatarPath = `${user.id}/${AVATAR_OBJECT_NAME}`;
  const { error: uploadError } = await supabase.storage.from(AVATARS_BUCKET).upload(avatarPath, normalizedJpegFile, {
    contentType: "image/jpeg",
    upsert: true
  });
  if (uploadError) {
    return { ok: false, message: "Не удалось загрузить аватар. Повторите попытку" };
  }

  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarPath })
    .eq("user_id", user.id);
  if (profileUpdateError) {
    await supabase.storage.from(AVATARS_BUCKET).remove([avatarPath]);
    return { ok: false, message: "Не удалось загрузить аватар. Повторите попытку" };
  }

  revalidatePath("/profile");
  return { ok: true };
}

export async function deleteAvatarAction(): Promise<AvatarMutationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, message: "Не удалось удалить аватар. Повторите попытку" };
  }

  const avatarPath = `${user.id}/${AVATAR_OBJECT_NAME}`;
  const { error: removeError } = await supabase.storage.from(AVATARS_BUCKET).remove([avatarPath]);
  if (removeError) {
    return { ok: false, message: "Не удалось удалить аватар. Повторите попытку" };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("user_id", user.id);
  if (updateError) {
    return { ok: false, message: "Не удалось удалить аватар. Повторите попытку" };
  }

  revalidatePath("/profile");
  return { ok: true };
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

