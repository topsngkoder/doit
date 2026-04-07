import Link from "next/link";
import { redirect } from "next/navigation";
import { Toast } from "@/components/ui/toast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPES,
  isNotificationChannel,
  isNotificationEventType,
  type NotificationChannel,
  type NotificationEventType
} from "@/lib/notifications/constants";
import { NotificationSettingsClient } from "./notification-settings-client";
import { setNotificationPreferenceEnabledAction } from "./actions";

type PreferenceKey = `${NotificationEventType}:${NotificationChannel}`;

function prefKey(eventType: NotificationEventType, channel: NotificationChannel): PreferenceKey {
  return `${eventType}:${channel}`;
}

export default async function NotificationSettingsPage() {
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

  const { data: prefRows, error: prefsError } = await supabase
    .from("notification_preferences")
    .select("channel, event_type, enabled")
    .eq("user_id", user.id)
    .in("channel", [...NOTIFICATION_CHANNELS])
    .in("event_type", [...NOTIFICATION_EVENT_TYPES]);

  const initialPreferences: Record<PreferenceKey, boolean> = Object.fromEntries(
    NOTIFICATION_EVENT_TYPES.flatMap((eventType) =>
      NOTIFICATION_CHANNELS.map((channel) => [prefKey(eventType, channel), true] as const)
    )
  ) as Record<PreferenceKey, boolean>;

  for (const r of prefRows ?? []) {
    const channel = typeof r.channel === "string" ? r.channel : "";
    const eventType = typeof r.event_type === "string" ? r.event_type : "";
    if (!isNotificationChannel(channel) || !isNotificationEventType(eventType)) continue;
    initialPreferences[prefKey(eventType, channel)] = !!r.enabled;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Настройки уведомлений</h1>
          </div>
          <p className="text-sm text-slate-400">
            Канал × событие (6 типов) · автосохранение без отдельной кнопки.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/notifications"
            className="rounded-md px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-slate-50"
          >
            ← Уведомления
          </Link>
        </div>
      </header>

      {prefsError ? (
        <Toast title="Ошибка загрузки предпочтений" message={prefsError.message} variant="error" />
      ) : null}

      <NotificationSettingsClient
        initialPreferences={initialPreferences}
        setPreferenceEnabledAction={setNotificationPreferenceEnabledAction}
      />
    </main>
  );
}

