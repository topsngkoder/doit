import Link from "next/link";
import { Toast } from "@/components/ui/toast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";
import { UserDebugClient } from "./UserDebugClient";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          Вход в Doit
        </h1>
        <p className="text-sm text-slate-400">
          Вход по email и паролю (учётные записи из Supabase Auth). OAuth — позже.
        </p>
      </header>
      <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-200">
        <LoginForm />
        <p className="text-center text-xs text-slate-400">
          Нет аккаунта?{" "}
          <Link href="/signup" className="font-medium text-sky-400 hover:text-sky-300 hover:underline">
            Регистрация
          </Link>
        </p>
        <Toast
          title="Локальная разработка"
          message="Если видите «Email not confirmed» — в Dashboard: Authentication → Providers → Email → отключите «Confirm email» или подтвердите письмо."
          variant="info"
        />
      </section>
      <UserDebugClient />
    </main>
  );
}

