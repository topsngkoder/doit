import type { NotificationEventType } from "@/lib/notifications/constants";

/** Значение `notification_outbox.channel` для email-очереди (.ai/notifications-specification.md §11.2). */
export const NOTIFICATION_OUTBOX_EMAIL_CHANNEL = "email" as const;

export type NotificationOutboxStatus = "pending" | "sent" | "failed";

/**
 * Строка `public.notification_outbox` для отправки письма (NT8.1).
 * Совпадает по смыслу с колонками БД; `link_url` в БД может быть относительным (`/boards/...`).
 *
 * Самодостаточность для воркера:
 * - тема письма: `title` (тексты строго §10.1, задаётся только типом события в enqueue);
 * - текст: `body` (§10.2 — доска, карточка, автор при наличии, описание; UTF-8, plain text);
 * - получатель: `user_id` → `profiles.email` (или актуальный email из auth на момент отправки);
 * - ссылка в письме: {@link resolveAppLinkForEmail} с публичным origin приложения.
 */
export type NotificationOutboxEmailRow = {
  id: string;
  user_id: string;
  channel: typeof NOTIFICATION_OUTBOX_EMAIL_CHANNEL;
  status: NotificationOutboxStatus;
  event_type: NotificationEventType;
  actor_user_id: string | null;
  board_id: string | null;
  card_id: string | null;
  title: string;
  body: string;
  link_url: string | null;
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function ensureLeadingSlash(path: string): string {
  if (path.startsWith("/")) return path;
  return `/${path}`;
}

/**
 * Преобразует `link_url` из outbox в абсолютный URL для email-клиентов.
 * Уже абсолютные `http:`/`https:` возвращаются без изменений (после trim).
 */
export function resolveAppLinkForEmail(linkUrl: string, publicAppOrigin: string): string {
  const path = linkUrl.trim();
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const origin = trimTrailingSlash(publicAppOrigin.trim());
  if (!origin) return ensureLeadingSlash(path);
  return `${origin}${ensureLeadingSlash(path)}`;
}
