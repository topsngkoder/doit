import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/boards");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Регистрация в Doit</h1>
        <p className="text-sm text-slate-400">
          Создайте аккаунт и сразу заполните обязательные поля профиля.
        </p>
      </header>
      <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-200">
        <SignupForm />
      </section>
    </main>
  );
}
