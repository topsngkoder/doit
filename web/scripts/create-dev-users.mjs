/**
 * Однократное создание двух тестовых пользователей через Supabase Admin API.
 *
 * Требуется в окружении:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (из Dashboard → Settings → API, секретный ключ)
 *
 * Запуск из папки web:
 *   node scripts/create-dev-users.mjs
 *
 * Ключ service_role не кладите в клиент и не коммитьте.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function randomPassword() {
  const base = crypto.randomBytes(18).toString("base64url");
  return `${base.slice(0, 20)}aA1!`;
}

const users = [
  {
    email: process.env.DEV_USER_1_EMAIL ?? "doit-dev-1@example.local",
    password: process.env.DEV_USER_1_PASSWORD ?? randomPassword()
  },
  {
    email: process.env.DEV_USER_2_EMAIL ?? "doit-dev-2@example.local",
    password: process.env.DEV_USER_2_PASSWORD ?? randomPassword()
  }
];

async function main() {
  if (!url || !serviceKey) {
    console.error(
      "Задайте NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (например в .env.local перед запуском через dotenv — см. README в scripts)."
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log("\n=== Doit: создание dev-пользователей ===\n");

  for (const u of users) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true
    });

    if (error) {
      if (error.message?.includes("already been registered") || error.status === 422) {
        console.log(`Пропуск (уже есть): ${u.email}`);
        console.log(`  Пароль скрипт не менял — задаётся только при создании.\n`);
        continue;
      }
      console.error(`Ошибка для ${u.email}:`, error.message);
      continue;
    }

    console.log(`Создан: ${u.email}`);
    console.log(`  user id: ${data.user?.id}`);
    console.log(`  пароль:  ${u.password}`);
    console.log("");
  }

  console.log(
    "Сохраните пароли в менеджер секретов. После подключения формы входа используйте эти email/пароли на /login.\n"
  );
}

main();
