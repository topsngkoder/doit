export type SendOutboxEmailResult = { ok: true } | { ok: false; error: string };

/**
 * Отправка одного письма через [Resend](https://resend.com/docs/api-reference/emails/send-email) (HTTP, без SDK).
 */
export async function sendOutboxEmailViaResend(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<SendOutboxEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_EMAIL_FROM;

  if (!apiKey || !from) {
    return {
      ok: false,
      error: "Не заданы RESEND_API_KEY или NOTIFICATION_EMAIL_FROM."
    };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      text: params.text
    })
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const j = (await res.json()) as { message?: unknown };
      if (typeof j?.message === "string") message = j.message;
      else if (Array.isArray(j?.message)) message = JSON.stringify(j.message);
    } catch {
      /* оставляем statusText */
    }
    return { ok: false, error: `Resend ${res.status}: ${message}` };
  }

  return { ok: true };
}
