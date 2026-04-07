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

function Switch({
  checked,
  disabled,
  onChange,
  label
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
        checked ? "border-sky-400/60 bg-sky-500/30" : "border-slate-700 bg-slate-900/40",
        disabled ? "opacity-60" : "hover:border-slate-500"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 translate-x-0.5 rounded-full bg-slate-200 shadow transition-transform",
          checked ? "translate-x-5 bg-sky-200" : "translate-x-0.5 bg-slate-200"
        )}
      />
    </button>
  );
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

                {NOTIFICATION_CHANNELS.map((channel) => (
                  <div key={channel} className="flex justify-center">
                    <Switch
                      checked={!!prefs[buildKey(eventType, channel)]}
                      disabled={isPending}
                      label={`${NOTIFICATION_EVENT_TYPE_LABEL[eventType]} · ${NOTIFICATION_CHANNEL_LABEL[channel]}`}
                      onChange={(next) => submitPreference(eventType, channel, next)}
                    />
                  </div>
                ))}
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
