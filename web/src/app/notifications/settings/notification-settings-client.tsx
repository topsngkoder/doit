"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  NOTIFICATION_CHANNEL_LABEL,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPE_LABEL,
  NOTIFICATION_EVENT_TYPES,
  type NotificationChannel,
  type NotificationEventType
} from "@/lib/notifications/constants";

type PreferenceKey = `${NotificationEventType}:${NotificationChannel}`;

type ServerResult = { ok: true } | { ok: false; message: string };

type Props = {
  initialPreferences: Record<PreferenceKey, boolean>;
  setPreferenceEnabledAction: (formData: FormData) => Promise<ServerResult>;
};

function buildKey(eventType: NotificationEventType, channel: NotificationChannel): PreferenceKey {
  return `${eventType}:${channel}`;
}

export function NotificationSettingsClient({
  initialPreferences,
  setPreferenceEnabledAction
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [prefs, setPrefs] = useState<Record<PreferenceKey, boolean>>(initialPreferences);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

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

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <div className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
          Вы не получаете уведомления, где являетесь автором действий.
        </div>

        {lastMessage ? (
          <div
            className={cn(
              "mt-3 rounded-md px-3 py-2 text-xs",
              lastMessage === "Сохранено." ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200"
            )}
          >
            {lastMessage}
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60">
        <div className="grid grid-cols-[1fr_120px_140px] gap-0 border-b border-slate-800 px-4 py-3 text-xs font-semibold text-slate-200">
          <div>Тип уведомления</div>
          {NOTIFICATION_CHANNELS.map((channel) => (
            <div key={channel} className="text-center">
              {NOTIFICATION_CHANNEL_LABEL[channel]}
            </div>
          ))}
        </div>

        <div className="divide-y divide-slate-800">
          {NOTIFICATION_EVENT_TYPES.map((eventType) => {
            return (
              <div
                key={eventType}
                className="grid grid-cols-[1fr_120px_140px] items-center gap-0 px-4 py-3 text-sm"
              >
                <div className="min-w-0 pr-3 text-slate-100">
                  <div className="truncate">{NOTIFICATION_EVENT_TYPE_LABEL[eventType]}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{eventType}</div>
                </div>

                {NOTIFICATION_CHANNELS.map((channel) => {
                  const label = `${NOTIFICATION_EVENT_TYPE_LABEL[eventType]} · ${NOTIFICATION_CHANNEL_LABEL[channel]}`;
                  return (
                    <div key={channel} className="flex justify-center">
                      <input
                        type="checkbox"
                        className={cn(
                          "h-4 w-4 cursor-pointer rounded border-slate-600 bg-slate-900",
                          "text-sky-500 accent-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/60",
                          "disabled:cursor-not-allowed disabled:opacity-60"
                        )}
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

      <div className="text-xs text-slate-500">
        Автосохранение включено{isPending ? " (сохранение…)" : ""}.
      </div>
    </section>
  );
}
