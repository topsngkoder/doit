import Link from "next/link";

export default async function HomePage() {
  return (
    <main className="flex flex-1 justify-center pt-16 sm:pt-24 lg:pt-28">
      <section className="flex w-full max-w-3xl flex-col items-center gap-5 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
            Doit — доски задач
          </h1>
          <p className="max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
            Простое пространство для работы с досками, задачами и командой.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-sky-500 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-sky-600"
          >
            Войти
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-slate-600 px-5 py-2.5 text-sm font-medium text-slate-100 hover:border-slate-400"
          >
            Зарегистрироваться
          </Link>
        </div>
      </section>
    </main>
  );
}

