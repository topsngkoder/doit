"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { readBrowserNotificationPermission } from "@/lib/notifications/browser-notification-permission";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isNotificationEventType, type NotificationEventType } from "@/lib/notifications/constants";

/** Данные вставки из Realtime (INSERT), достаточные для NT7.5–NT7.6. */
export type InternalNotificationInsertRow = {
  id: string;
  user_id: string;
  event_type: NotificationEventType;
  title: string;
  body: string;
  link_url: string | null;
  created_at: string;
};

type BrowserNativeNotificationsContextValue = {
  subscribe: (listener: (row: InternalNotificationInsertRow) => void) => () => void;
};

const BrowserNativeNotificationsContext =
  React.createContext<BrowserNativeNotificationsContextValue | null>(null);

function parseInternalNotificationInsert(raw: unknown): InternalNotificationInsertRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const user_id = typeof o.user_id === "string" ? o.user_id : null;
  const event_type_raw = typeof o.event_type === "string" ? o.event_type : null;
  const title = typeof o.title === "string" ? o.title : null;
  const body = typeof o.body === "string" ? o.body : null;
  const created_at = typeof o.created_at === "string" ? o.created_at : null;
  if (!id || !user_id || !event_type_raw || !title || !body || !created_at) return null;
  if (!isNotificationEventType(event_type_raw)) return null;
  const link_url = o.link_url === null || o.link_url === undefined
    ? null
    : typeof o.link_url === "string"
      ? o.link_url
      : null;
  return { id, user_id, event_type: event_type_raw, title, body, link_url, created_at };
}

/** §8.3–8.4: не показывать на активной видимой вкладке; показать, если вкладка скрыта или окно без фокуса. */
function shouldOfferNativeBrowserPopup(): boolean {
  if (typeof document === "undefined") return false;
  if (document.visibilityState === "hidden" || document.hidden) return true;
  if (typeof document.hasFocus === "function" && !document.hasFocus()) return true;
  return false;
}

const DEDUPE_MAX = 500;

function trimDedupeSet(ids: Set<string>) {
  while (ids.size > DEDUPE_MAX) {
    const first = ids.values().next().value as string | undefined;
    if (first === undefined) break;
    ids.delete(first);
  }
}

/**
 * Показ нативного уведомления по правилам §8 (внутренняя запись уже создана — событие INSERT).
 */
function BrowserNativeNotificationPresenter() {
  const shownIdsRef = React.useRef(new Set<string>());

  useInternalNotificationInserts((row) => {
    void (async () => {
      if (shownIdsRef.current.has(row.id)) return;

      if (!shouldOfferNativeBrowserPopup()) return;

      const perm = readBrowserNotificationPermission();
      if (perm.kind !== "ready" || perm.permission !== "granted") return;

      let supabase: ReturnType<typeof createSupabaseBrowserClient>;
      try {
        supabase = createSupabaseBrowserClient();
      } catch {
        return;
      }

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();
      if (userError || !user || user.id !== row.user_id) return;

      const { data: pref } = await supabase
        .from("notification_preferences")
        .select("enabled")
        .eq("user_id", user.id)
        .eq("channel", "browser")
        .eq("event_type", row.event_type)
        .maybeSingle();

      const browserEnabled = pref?.enabled !== false;

      if (!browserEnabled) return;

      if (typeof Notification === "undefined") return;

      shownIdsRef.current.add(row.id);
      trimDedupeSet(shownIdsRef.current);

      try {
        const n = new Notification(row.title, {
          body: row.body,
          ...(row.link_url ? { data: { url: row.link_url } } : {})
        });
        n.onclick = () => {
          window.focus();
          if (row.link_url) {
            window.location.href = row.link_url;
          }
          n.close();
        };
      } catch {
        shownIdsRef.current.delete(row.id);
      }
    })();
  });

  return null;
}

/**
 * Единая точка подписки на INSERT в `internal_notifications` для текущего пользователя.
 * Нативный показ и дедупликация — см. `BrowserNativeNotificationPresenter` (§8, NT7.5+).
 */
export function BrowserNativeNotificationsProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = React.useRef(new Set<(row: InternalNotificationInsertRow) => void>());

  const subscribe = React.useCallback((listener: (row: InternalNotificationInsertRow) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const emit = React.useCallback((row: InternalNotificationInsertRow) => {
    for (const fn of listenersRef.current) {
      try {
        fn(row);
      } catch {
        /* изоляция слушателей */
      }
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    let activeChannel: RealtimeChannel | null = null;

    const removeChannel = () => {
      if (supabase && activeChannel) {
        void supabase.removeChannel(activeChannel);
        activeChannel = null;
      }
    };

    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      return;
    }

    const attachForUser = (userId: string) => {
      removeChannel();
      if (cancelled || !supabase) return;
      const ch = supabase
        .channel(`internal_notifications:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "internal_notifications",
            filter: `user_id=eq.${userId}`
          },
          (payload) => {
            const row = parseInternalNotificationInsert(payload.new);
            if (row) emit(row);
          }
        )
        .subscribe();
      activeChannel = ch;
    };

    const syncSession = async () => {
      const { data: { session } } = await supabase!.auth.getSession();
      if (cancelled) return;
      removeChannel();
      const uid = session?.user?.id;
      if (uid) attachForUser(uid);
    };

    void syncSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      removeChannel();
      const uid = session?.user?.id;
      if (uid) attachForUser(uid);
    });

    return () => {
      cancelled = true;
      removeChannel();
      subscription.unsubscribe();
    };
  }, [emit]);

  const value = React.useMemo(() => ({ subscribe }), [subscribe]);

  return (
    <BrowserNativeNotificationsContext.Provider value={value}>
      <BrowserNativeNotificationPresenter />
      {children}
    </BrowserNativeNotificationsContext.Provider>
  );
}

/**
 * Подписка на новые внутренние уведомления (после монтирования дерева под provider).
 * Передавайте стабильную логику через ref внутри listener при необходимости.
 */
function useInternalNotificationInserts(
  listener: (row: InternalNotificationInsertRow) => void
) {
  const ctx = React.useContext(BrowserNativeNotificationsContext);
  const listenerRef = React.useRef(listener);
  listenerRef.current = listener;

  React.useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe((row) => {
      listenerRef.current(row);
    });
  }, [ctx]);
}

/** Экспорт для тестов и дополнительных слушателей наравне с презентером. */
export { useInternalNotificationInserts };
