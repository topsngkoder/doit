import Link from "next/link";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { BrowserNativeNotificationsProvider } from "@/lib/notifications/browser-native-notifications-provider";
import { DoitLogoLink } from "@/components/doit-logo-link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./globals.css";

const AVATARS_BUCKET = "avatars";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function getProfileAvatarFallback(displayName: string | null, email: string | null): string {
  const nameInitial = displayName?.trim().charAt(0).toUpperCase();
  if (nameInitial) return nameInitial;
  const emailInitial = email?.trim().charAt(0).toUpperCase();
  if (emailInitial) return emailInitial;
  return "?";
}

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Doit",
  description: "Task boards app"
};

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  const isSessionMissing = userError?.message === "Auth session missing!";
  const isAuthenticated = !!user && !(userError && !isSessionMissing);
  let avatarFallback = getProfileAvatarFallback(user?.user_metadata?.display_name ?? null, user?.email ?? null);

  let profileAvatarUrl: string | null = null;
  if (isAuthenticated && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_url,display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    avatarFallback = getProfileAvatarFallback(profile?.display_name ?? null, user.email ?? null);
    const avatarPath = profile?.avatar_url?.trim() || null;
    if (avatarPath) {
      const { data: avatarData, error: avatarError } = await supabase.storage
        .from(AVATARS_BUCKET)
        .createSignedUrl(avatarPath, SIGNED_URL_TTL_SECONDS);
      if (!avatarError && avatarData?.signedUrl) {
        profileAvatarUrl = avatarData.signedUrl;
      }
    }
  }

  let unreadCount = 0;
  if (isAuthenticated) {
    const { count } = await supabase
      .from("internal_notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    unreadCount = count ?? 0;
  }

  return (
    <html lang="ru" className={manrope.variable} style={{ backgroundColor: "#09090b" }}>
      <body
        className="min-h-screen bg-slate-950 font-sans text-slate-50"
        style={{ backgroundColor: "#09090b", color: "#fafafa" }}
      >
        <BrowserNativeNotificationsProvider>
        <div className="flex min-h-screen flex-col pt-2">
          <header className="mb-2 border-b border-slate-800">
            <div className="flex w-full items-center justify-between gap-2 px-3 pb-1.5">
              <DoitLogoLink />
            <nav className="flex items-center gap-1.5 text-sm text-slate-300">
              <Link
                href="/notifications"
                className="relative rounded-md p-0.5 hover:bg-slate-800 hover:text-slate-50"
                aria-label="Уведомления"
                title="Уведомления"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6.25 9.75a5.75 5.75 0 1 1 11.5 0v4.58c0 .8.3 1.58.84 2.18l1.16 1.29H4.25l1.16-1.29c.54-.6.84-1.38.84-2.18V9.75Z" />
                  <path d="M9.75 18.5a2.25 2.25 0 0 0 4.5 0" />
                </svg>
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-sky-500 px-1 text-center text-[10px] font-semibold leading-4 text-slate-950">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/boards"
                className="rounded-md px-2 py-0.5 hover:bg-slate-800 hover:text-slate-50"
              >
                Мои доски
              </Link>
              <Link
                href="/profile"
                className="rounded-md px-2 py-0.5 hover:bg-slate-800 hover:text-slate-50"
              >
                Личный кабинет
              </Link>
              <Link
                href="/profile"
                className="group rounded-full p-0.5 hover:bg-slate-800"
                aria-label="Перейти в личный кабинет"
                title="Личный кабинет"
              >
                <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-900 text-[11px] font-semibold text-slate-200 transition group-hover:border-sky-500/70">
                  {profileAvatarUrl ? (
                    <img src={profileAvatarUrl} alt="Аватар пользователя" className="h-full w-full object-cover" />
                  ) : (
                    <span>{avatarFallback}</span>
                  )}
                </div>
              </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto flex w-full max-w-5xl flex-1 px-4">{children}</main>
        </div>
        </BrowserNativeNotificationsProvider>
      </body>
    </html>
  );
}

