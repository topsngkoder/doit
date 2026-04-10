"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignUpInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  position?: string | null;
  department?: string | null;
};

export type SignUpResult = { ok: true; needsEmailConfirmation: true } | { ok: false; message: string };

const EMAIL_CONFIRMATION_REDIRECT_URL = "https://doit-xi-inky.vercel.app";

function normalizeRequired(raw: string): string {
  return raw.trim();
}

function normalizeOptional(raw: string | null | undefined): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

export async function signUpAction(input: SignUpInput): Promise<SignUpResult> {
  const email = normalizeRequired(input.email);
  const password = input.password;
  const firstName = normalizeRequired(input.firstName);
  const lastName = normalizeRequired(input.lastName);
  const position = normalizeOptional(input.position);
  const department = normalizeOptional(input.department);

  if (!email) {
    return { ok: false, message: "Заполните email" };
  }
  if (password.length < 1) {
    return { ok: false, message: "Заполните пароль" };
  }
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

  const userData: Record<string, string> = {
    first_name: firstName,
    last_name: lastName
  };
  if (position !== null) {
    userData.position = position;
  }
  if (department !== null) {
    userData.department = department;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: userData,
      emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL
    }
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("user already")) {
      return { ok: false, message: "Пользователь с таким email уже зарегистрирован" };
    }
    if (msg.includes("password")) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: error.message || "Не удалось зарегистрироваться. Повторите попытку" };
  }

  if (data.session) {
    redirect("/go");
  }

  return { ok: true, needsEmailConfirmation: true };
}
