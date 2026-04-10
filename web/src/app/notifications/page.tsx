import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  markAllInternalNotificationsReadAction,
  markInternalNotificationReadAction
} from "./actions";

type NotificationsPageProps = {
  searchParams: Promise<{ error?: string }>;
};

function formatRuDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU");
}

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  const isSessionMissing = userError?.message === "Auth session missing!";
  const isAuthenticated = !!user && !(userError && !isSessionMissing);

  if (!isAuthenticated) {
    redirect("/login");
  }

  const sp = await searchParams;
  const errorMessage = sp.error;

  const { data: rows, error: listError } = await supabase
    .from("internal_notifications")
    .select("id, user_id, title, body, link_url, created_at, read_at, board_id, card_id")
    .order("created_at", { ascending: false })
    .limit(50);

  const notifications = rows ?? [];
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const headerLinkClass =
    "focus-ring-app rounded-md px-3 py-1.5 text-xs font-medium text-app-secondary transition-colors hover:bg-app-surface-muted hover:text-app-primary";

  return (
    <main className="notifications-scroll-transparent mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto py-2">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-app-primary">
            Центр уведомлений
          </h1>
          <p className="text-sm text-app-secondary">
            Ваши уведомления в приложении. Непрочитанных:{" "}
            <span className="font-medium text-app-primary">{unreadCount}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/notifications/settings" className={headerLinkClass}>
            Настройки
          </Link>

          <form action={markAllInternalNotificationsReadAction}>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={unreadCount === 0}
              title={unreadCount === 0 ? "Нет непрочитанных уведомлений" : "Отметить все прочитанными"}
            >
              Отметить все
            </Button>
          </form>
        </div>
      </header>

      {errorMessage ? (
        <Toast title="Ошибка" message={errorMessage} variant="error" />
      ) : null}

      {listError ? (
        <Toast title="Ошибка загрузки" message={listError.message} variant="error" />
      ) : null}

      <section className="surface-card px-4 py-5 text-sm text-app-primary">
        {notifications.length === 0 ? (
          <p className="text-app-secondary">Пока нет уведомлений.</p>
        ) : (
          <ul className="space-y-3">
            {notifications.map((n) => {
              const isUnread = !n.read_at;
              const href =
                typeof n.link_url === "string" && n.link_url.startsWith("/")
                  ? n.link_url
                  : n.board_id
                    ? `/boards/${n.board_id}`
                    : null;

              return (
                <li
                  key={n.id}
                  className={[
                    "p-3",
                    isUnread ? "notification-item-unread" : "notification-item-read"
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate font-medium text-app-primary">{n.title}</div>
                        <span
                          className={
                            isUnread ? "notification-badge-unread" : "notification-badge-read"
                          }
                        >
                          {isUnread ? "новое" : "прочитано"}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap break-words text-sm text-app-secondary">
                        {n.body}
                      </div>
                      <div className="text-xs text-app-tertiary">
                        {formatRuDateTime(n.created_at)}
                        {n.read_at ? ` · прочитано: ${formatRuDateTime(n.read_at)}` : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {href ? (
                        <Link
                          href={href}
                          className="focus-ring-app rounded-md px-3 py-1.5 text-xs font-medium text-app-link transition-colors hover:bg-app-surface-muted hover:text-[color:var(--text-link-hover)]"
                        >
                          Открыть
                        </Link>
                      ) : null}

                      {isUnread ? (
                        <form action={markInternalNotificationReadAction}>
                          <input type="hidden" name="id" value={n.id} />
                          <Button type="submit" size="sm" variant="secondary">
                            Прочитано
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

