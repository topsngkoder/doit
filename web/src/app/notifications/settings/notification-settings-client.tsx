"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  NOTIFICATION_CHANNEL_LABEL,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPE_LABEL,
  NOTIFICATION_EVENT_TYPES,
  type NotificationChannel,
  type NotificationEventType
} from "@/lib/notifications/constants";
import type { BrowserNotificationPermissionStatus } from "@/lib/notifications/browser-notification-permission";
import { useBrowserNotificationPermission } from "@/lib/notifications/use-browser-notification-permission";

type PreferenceKey = `${NotificationEventType}:${NotificationChannel}`;

type ServerResult = { ok: true } | { ok: false; message: string };

type Props = {
  initialPreferences: Record<PreferenceKey, boolean>;
  setPreferenceEnabledAction: (formData: FormData) => Promise<ServerResult>;
};

function buildKey(eventType: NotificationEventType, channel: NotificationChannel): PreferenceKey {
  return `${eventType}:${channel}`;
}

/** Для проверки NT7.1: значение `data-browser-notification-permission` на корне секции. */
function browserPermissionDataAttribute(
  status: BrowserNotificationPermissionStatus | null
): "pending" | "unsupported" | "default" | "granted" | "denied" {
  if (status === null) {
    return "pending";
  }
  if (status.kind === "unsupported") {
    return "unsupported";
  }
  return status.permission;
}

export function NotificationSettingsClient({
  initialPreferences,
  setPreferenceEnabledAction
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [prefs, setPrefs] = useState<Record<PreferenceKey, boolean>>(initialPreferences);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [isRequestingBrowserPermission, setIsRequestingBrowserPermission] = useState(false);
  const { status: browserNotificationPermission, refresh: refreshBrowserNotificationPermission } =
    useBrowserNotificationPermission();

  function setToastFromResult(result: ServerResult) {
    if (result.ok) {
      setLastMessage("Сохранено.");
      return;
    }
    setLastMessage(result.message);
  }

  function submitPreference(eventType: NotificationEventType, channel: NotificationChannel, enabled: boolean) {
    const key = buildKey(eventType, channel);
    setPrefs((prev) => ({ ...prev, [key]: enabled }));
    setLastMessage(null);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("event_type", eventType);
      fd.set("channel", channel);
      fd.set("enabled", enabled ? "1" : "0");
      const result = await setPreferenceEnabledAction(fd);
      setToastFromResult(result);
    });
  }

  async function handleRequestBrowserNotificationPermission() {
    if (typeof Notification === "undefined") {
      return;
    }
    setIsRequestingBrowserPermission(true);
    try {
      await Notification.requestPermission();
    } catch {
      // небезопасный контекст / ограничения браузера — перечитываем фактическое состояние
    } finally {
      refreshBrowserNotificationPermission();
      setIsRequestingBrowserPermission(false);
    }
  }

  return (
    <section
      className="space-y-5"
      data-browser-notification-permission={browserPermissionDataAttribute(browserNotificationPermission)}
    >
      <div className="surface-card p-4">
        <h2 className="text-sm font-semibold text-app-primary">Уведомления в браузере</h2>
        <p className="mt-1 text-xs text-app-tertiary">
          Системные уведомления ОС при открытом приложении. Не влияют на таблицу ниже и не включают email.
        </p>
        <div className="mt-3">
          {browserNotificationPermission === null ? (
            <p className="text-xs text-app-secondary">Проверяем доступ к уведомлениям…</p>
          ) : browserNotificationPermission.kind === "unsupported" ? (
            <p className="text-xs text-app-secondary">
              В этом браузере недоступны системные уведомления (нет API или открыт небезопасный адрес). Внутренний центр
              уведомлений по-прежнему работает.
            </p>
          ) : browserNotificationPermission.permission === "granted" ? (
            <p
              className="rounded-md border px-2 py-1 text-xs font-medium"
              style={{
                backgroundColor: "var(--success-subtle-bg)",
                borderColor: "var(--success-subtle-border)",
                color: "var(--success-subtle-text)"
              }}
            >
              Браузерные уведомления включены
            </p>
          ) : browserNotificationPermission.permission === "denied" ? (
            <p
              className="rounded-md border px-2 py-1 text-xs"
              style={{
                backgroundColor: "var(--warning-subtle-bg)",
                borderColor: "var(--warning-subtle-border)",
                color: "var(--warning-subtle-text)"
              }}
            >
              Браузер запретил уведомления. Разрешите их вручную в настройках браузера и обновите страницу.
            </p>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={isRequestingBrowserPermission || isPending}
              onClick={() => void handleRequestBrowserNotificationPermission()}
            >
              {isRequestingBrowserPermission ? "Запрос…" : "Включить уведомления в браузере"}
            </Button>
          )}
        </div>
      </div>

      <div className="surface-card p-4">
        <div className="rounded-md border border-app-divider bg-app-surface-muted px-3 py-2 text-xs text-app-secondary">
          Вы не получаете уведомления, где являетесь автором действий.
        </div>

        {lastMessage ? (
          <div
            className={cn(
              "mt-3 rounded-md px-3 py-2 text-xs",
              lastMessage === "Сохранено."
                ? "border"
                : "border"
            )}
            style={
              lastMessage === "Сохранено."
                ? {
                    backgroundColor: "var(--success-subtle-bg)",
                    borderColor: "var(--success-subtle-border)",
                    color: "var(--success-subtle-text)"
                  }
                : {
                    backgroundColor: "var(--danger-subtle-bg)",
                    borderColor: "var(--danger-subtle-border)",
                    color: "var(--danger-subtle-text)"
                  }
            }
          >
            {lastMessage}
          </div>
        ) : null}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_140px] gap-0 border-b border-app-divider px-4 py-3 text-xs font-semibold text-app-secondary">
          <div>Тип уведомления</div>
          {NOTIFICATION_CHANNELS.map((channel) => (
            <div key={channel} className="text-center">
              {NOTIFICATION_CHANNEL_LABEL[channel]}
            </div>
          ))}
        </div>

        <div className="divide-y divide-[color:var(--border-divider)]">
          {NOTIFICATION_EVENT_TYPES.map((eventType) => {
            return (
              <div
                key={eventType}
                className="grid grid-cols-[1fr_120px_140px] items-center gap-0 px-4 py-3 text-sm"
              >
                <div className="min-w-0 pr-3 text-app-primary">
                  <div className="truncate">{NOTIFICATION_EVENT_TYPE_LABEL[eventType]}</div>
                  <div className="mt-0.5 text-xs text-app-tertiary">{eventType}</div>
                </div>

                {NOTIFICATION_CHANNELS.map((channel) => {
                  const label = `${NOTIFICATION_EVENT_TYPE_LABEL[eventType]} · ${NOTIFICATION_CHANNEL_LABEL[channel]}`;
                  return (
                    <div key={channel} className="flex justify-center">
                      <input
                        type="checkbox"
                        className="checkbox-app"
                        checked={!!prefs[buildKey(eventType, channel)]}
                        disabled={isPending}
                        aria-label={label}
                        onChange={(e) => submitPreference(eventType, channel, e.target.checked)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-app-tertiary">
        Автосохранение включено{isPending ? " (сохранение…)" : ""}.
      </div>
    </section>
  );
}
