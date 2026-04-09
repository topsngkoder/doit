import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();
  const isSessionMissing = error?.message === "Auth session missing!";
  const isAuthenticated = !!user && !(error && !isSessionMissing);

  if (isAuthenticated) {
    redirect("/go");
  }

  return (
    <main className="flex flex-1 justify-center pt-16 sm:pt-24 lg:pt-28">
      <section className="flex w-full max-w-3xl flex-col items-center gap-5 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-app-primary sm:text-5xl">
            Doit — доски задач
          </h1>
          <p className="text-app-landing-subtitle max-w-xl text-sm leading-6 sm:text-base">
            Простое пространство для работы с досками, задачами и командой.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-[length:var(--radius-control)] bg-[var(--accent-bg)] px-5 py-2.5 text-sm font-medium text-[var(--text-on-accent)] shadow-sm transition-colors hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]"
          >
            Войти
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-[length:var(--radius-control)] border border-[var(--button-secondary-border)] bg-[var(--btn-secondary-bg)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--button-secondary-border-hover)] hover:bg-[var(--btn-secondary-hover-bg)] focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]"
          >
            Зарегистрироваться
          </Link>
        </div>
      </section>
    </main>
  );
}

