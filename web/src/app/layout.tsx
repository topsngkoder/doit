import Link from "next/link";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { BrowserNativeNotificationsProvider } from "@/lib/notifications/browser-native-notifications-provider";
import { ThemeProvider } from "@/lib/theme";
import { THEME_STORAGE_KEY } from "@/lib/theme/constants";
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

/** Синхронно до первой отрисовки; логика дублирует normalizeTheme + applyThemeToDocument (см. lib/theme). */
const themeBeforePaintScript = `(function(){var k=${JSON.stringify(THEME_STORAGE_KEY)};function apply(t){document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t;}try{var raw=localStorage.getItem(k);var t=raw==="light"||raw==="dark"?raw:"dark";apply(t);}catch(e){apply("dark");}})();`;

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

  const appShell = (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden pt-2">
      {isAuthenticated ? (
        <header className="app-global-header">
          <div className="app-header-toolbar flex w-full items-center justify-between gap-2 px-3 pb-1.5">
            <DoitLogoLink />
            <nav className="flex items-center gap-1.5 text-sm">
              <Link
                href="/notifications"
                className="app-header-hit focus-ring-app relative p-0.5"
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
                  <span className="app-header-notif-badge absolute -right-1 -top-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>
              <div className="relative group/boards">
                <Link
                  href="/boards"
                  className="app-header-hit app-header-boards-trigger focus-ring-app inline-flex items-center gap-1 px-2 py-0.5"
                  aria-haspopup={headerBoards.length > 0 ? "menu" : undefined}
                >
                  <span>Доски</span>
                  {headerBoards.length > 0 ? (
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="app-header-boards-chevron h-3.5 w-3.5"
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
                    <div className="app-header-boards-panel">
                      <div className="max-h-80 overflow-y-auto py-1">
                        {headerBoards.map((board) => (
                          <Link
                            key={board.id}
                            href={`/boards/${board.id}`}
                            className="app-header-boards-item"
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
              <Link href="/profile" className="app-header-hit focus-ring-app px-2 py-0.5">
                Личный кабинет
              </Link>
              <Link
                href="/profile"
                className="app-header-avatar-wrap focus-ring-app"
                aria-label="Перейти в личный кабинет"
                title="Личный кабинет"
              >
                <div className="app-header-avatar">
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
      <main className="flex min-h-0 w-full flex-1 overflow-hidden px-4">{children}</main>
    </div>
  );

  return (
    <html lang="ru" className={manrope.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBeforePaintScript }} />
      </head>
      <body className="min-h-screen font-sans">
        <ThemeProvider>
          {isAuthenticated && user ? (
            <BrowserNativeNotificationsProvider initialUserId={user.id}>
              {appShell}
            </BrowserNativeNotificationsProvider>
          ) : (
            appShell
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}

