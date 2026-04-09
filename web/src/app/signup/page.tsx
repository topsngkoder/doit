import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-app-primary">
          Регистрация в Doit
        </h1>
        <p className="text-sm text-app-tertiary">
          Создайте аккаунт и сразу заполните обязательные поля профиля.
        </p>
      </header>
      <section className="surface-card space-y-4 px-4 py-5 text-sm text-app-secondary">
        <SignupForm />
      </section>
    </main>
  );
}
