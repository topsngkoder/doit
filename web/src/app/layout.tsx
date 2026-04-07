import Link from "next/link";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Doit",
  description: "Task boards app"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={manrope.variable} style={{ backgroundColor: "#020617" }}>
      <body
        className="min-h-screen bg-slate-950 font-sans text-slate-50"
        style={{ backgroundColor: "#020617", color: "#f8fafc" }}
      >
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6">
          <header className="mb-6 flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Doit
            </Link>
            <nav className="flex items-center gap-3 text-sm text-slate-300">
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 hover:bg-slate-800 hover:text-slate-50"
              >
                Вход
              </Link>
              <Link
                href="/signup"
                className="rounded-md px-3 py-1.5 hover:bg-slate-800 hover:text-slate-50"
              >
                Регистрация
              </Link>
              <Link
                href="/notifications"
                className="rounded-md px-3 py-1.5 hover:bg-slate-800 hover:text-slate-50"
              >
                Уведомления
              </Link>
              <Link
                href="/boards"
                className="rounded-md px-3 py-1.5 hover:bg-slate-800 hover:text-slate-50"
              >
                Мои доски
              </Link>
              <Link
                href="/profile"
                className="rounded-md px-3 py-1.5 hover:bg-slate-800 hover:text-slate-50"
              >
                Личный кабинет
              </Link>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="mt-6 border-t border-slate-800 pt-3 text-xs text-slate-500">
            MVP Doit · Supabase + Next.js
          </footer>
        </div>
      </body>
    </html>
  );
}

