import type { SupabaseClient } from "@supabase/supabase-js";

import { formatOutboxEmailText } from "@/lib/notifications/format-outbox-email";
import { NOTIFICATION_OUTBOX_EMAIL_CHANNEL, resolveAppLinkForEmail } from "@/lib/notifications/notification-outbox";
import { sendOutboxEmailViaResend } from "@/lib/notifications/send-outbox-email-resend";
import { isNotificationEventType } from "@/lib/notifications/constants";

const MAX_ERROR_LEN = 4000;

function backoffSecondsAfterAttempt(attemptAfterIncrement: number): number {
  const steps = [60, 300, 900, 3600, 7200];
  const i = Math.min(Math.max(attemptAfterIncrement - 1, 0), steps.length - 1);
  return steps[i] ?? 300;
}

type OutboxRow = {
  id: string;
  user_id: string;
  status: string;
  event_type: string;
  title: string;
  body: string;
  link_url: string | null;
  attempts: number;
};

export type ProcessNotificationOutboxEmailBatchResult = {
  examined: number;
  sent: number;
  failedPermanent: number;
  scheduledRetry: number;
};

/**
 * Обрабатывает до `batchSize` строк `notification_outbox`: только `channel=email`, `status=pending`,
 * `next_attempt_at <= now()`. Увеличивает `attempts`; при неудаче после 5-й попытки — `failed`, иначе — `pending` + backoff.
 */
export async function processNotificationOutboxEmailBatch(
  supabase: SupabaseClient,
  options: { batchSize: number; appOrigin: string }
): Promise<ProcessNotificationOutboxEmailBatchResult> {
  const now = new Date().toISOString();
  const { batchSize, appOrigin } = options;

  const { data: rows, error: selectError } = await supabase
    .from("notification_outbox")
    .select("id, user_id, status, event_type, title, body, link_url, attempts")
    .eq("channel", NOTIFICATION_OUTBOX_EMAIL_CHANNEL)
    .eq("status", "pending")
    .lte("next_attempt_at", now)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (selectError) {
    throw new Error(selectError.message);
  }

  const list = (rows ?? []) as OutboxRow[];
  const result: ProcessNotificationOutboxEmailBatchResult = {
    examined: list.length,
    sent: 0,
    failedPermanent: 0,
    scheduledRetry: 0
  };

  if (list.length === 0) {
    return result;
  }

  const userIds = [...new Set(list.map((r) => r.user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, email")
    .in("user_id", userIds);

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const emailByUser = new Map(
    (profiles ?? []).map((p: { user_id: string; email: string }) => [p.user_id, p.email?.trim() ?? ""])
  );

  for (const row of list) {
    const newAttempts = row.attempts + 1;
    const email = emailByUser.get(row.user_id);

    if (!email) {
      await supabase
        .from("notification_outbox")
        .update({
          status: "failed",
          attempts: newAttempts,
          last_error: truncateError("В profiles нет email для user_id.")
        })
        .eq("id", row.id);
      result.failedPermanent += 1;
      continue;
    }

    const absLink = row.link_url ? resolveAppLinkForEmail(row.link_url, appOrigin) : "";
    const fallbackText = absLink ? `${row.body}\n\nСсылка: ${absLink}` : row.body;
    const text = isNotificationEventType(row.event_type)
      ? formatOutboxEmailText({
          eventType: row.event_type,
          title: row.title,
          body: row.body,
          linkUrl: absLink
        })
      : fallbackText;

    const send = await sendOutboxEmailViaResend({
      to: email,
      subject: row.title,
      text
    });

    if (send.ok) {
      await supabase
        .from("notification_outbox")
        .update({
          status: "sent",
          attempts: newAttempts,
          last_error: null
        })
        .eq("id", row.id);
      result.sent += 1;
      continue;
    }

    const err = send.error;
    if (newAttempts >= 5) {
      await supabase
        .from("notification_outbox")
        .update({
          status: "failed",
          attempts: newAttempts,
          last_error: truncateError(err)
        })
        .eq("id", row.id);
      result.failedPermanent += 1;
    } else {
      const delaySec = backoffSecondsAfterAttempt(newAttempts);
      const nextAt = new Date(Date.now() + delaySec * 1000).toISOString();
      await supabase
        .from("notification_outbox")
        .update({
          status: "pending",
          attempts: newAttempts,
          next_attempt_at: nextAt,
          last_error: truncateError(err)
        })
        .eq("id", row.id);
      result.scheduledRetry += 1;
    }
  }

  return result;
}

function truncateError(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_ERROR_LEN) return t;
  return `${t.slice(0, MAX_ERROR_LEN)}…`;
}
