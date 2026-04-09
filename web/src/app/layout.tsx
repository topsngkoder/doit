import Link from "next/link";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { BrowserNativeNotificationsProvider } from "@/lib/notifications/browser-native-notifications-provider";
import { DoitLogoLink } from "@/components/doit-logo-link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./globals.css";

const AVATARS_BUCKET = "avatars";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const dynamic = "force-dynamic";

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

type HeaderBoardLink = {
  id: string;
  name: string;
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
  let defaultBoardId: string | null = null;

  let profileAvatarUrl: string | null = null;
  if (isAuthenticated && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_url,display_name,default_board_id")
      .eq("user_id", user.id)
      .maybeSingle();
    avatarFallback = getProfileAvatarFallback(profile?.display_name ?? null, user.email ?? null);
    defaultBoardId = profile?.default_board_id ?? null;
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

  let headerBoards: HeaderBoardLink[] = [];
  if (isAuthenticated) {
    const { data: boards } = await supabase
      .from("boards")
      .select("id, name")
      .order("created_at", { ascending: false });

    headerBoards =
      boards?.map((board) => ({
        id: board.id,
        name: board.name?.trim() || "Без названия"
      })) ?? [];

    headerBoards.sort((a, b) => {
      if (a.id === defaultBoardId && b.id !== defaultBoardId) return -1;
      if (b.id === defaultBoardId && a.id !== defaultBoardId) return 1;
      return a.name.localeCompare(b.name, "ru", { sensitivity: "base" });
    });
  }

  return (
    <html lang="ru" className={manrope.variable} style={{ backgroundColor: "#09090b" }}>
      <body
        className="min-h-screen bg-slate-950 font-sans text-slate-50"
        style={{ backgroundColor: "#09090b", color: "#fafafa" }}
      >
        <BrowserNativeNotificationsProvider>
        <div className="flex min-h-screen flex-col pt-2">
          {isAuthenticated ? (
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
                <div className="relative group/boards">
                  <Link
                    href="/boards"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 hover:bg-slate-800 hover:text-slate-50 group-focus-within/boards:bg-slate-800 group-focus-within/boards:text-slate-50"
                    aria-haspopup={headerBoards.length > 0 ? "menu" : undefined}
                  >
                    <span>Мои доски</span>
                    {headerBoards.length > 0 ? (
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3.5 w-3.5 text-slate-500 transition group-hover/boards:text-slate-300 group-focus-within/boards:text-slate-300"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : null}
                  </Link>
                  {headerBoards.length > 0 ? (
                    <div className="invisible absolute left-0 top-full z-30 pt-2 opacity-0 transition duration-150 group-hover/boards:visible group-hover/boards:opacity-100 group-focus-within/boards:visible group-focus-within/boards:opacity-100">
                      <div className="w-72 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/95 shadow-2xl shadow-black/30 backdrop-blur">
                        <div className="max-h-80 overflow-y-auto py-1">
                          {headerBoards.map((board) => (
                            <Link
                              key={board.id}
                              href={`/boards/${board.id}`}
                              className="block truncate px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800/90 hover:text-slate-50 focus:bg-slate-800/90 focus:text-slate-50 focus:outline-none"
                              title={board.name}
                            >
                              {board.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
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
          ) : null}
          <main className="mx-auto flex w-full max-w-5xl flex-1 px-4">{children}</main>
        </div>
        </BrowserNativeNotificationsProvider>
      </body>
    </html>
  );
}

