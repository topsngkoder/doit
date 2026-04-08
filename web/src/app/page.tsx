import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
        Doit — доски задач
      </h1>
      <p className="max-w-md text-sm text-slate-300 sm:text-base">
        Минимальный каркас приложения готов. Перейди на страницу входа или
        списка досок.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/login"
          className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-sky-600"
        >
          Войти
        </Link>
        <Link
          href="/boards"
          className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-400"
        >
          Мои доски
        </Link>
      </div>
    </main>
  );
}

