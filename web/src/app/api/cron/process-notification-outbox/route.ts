import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { processNotificationOutboxEmailBatch } from "@/lib/notifications/process-notification-outbox-email-batch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_BATCH = 20;

function authorize(req: Request): boolean {
  const secret =
    process.env.NOTIFICATION_OUTBOX_CRON_SECRET ?? process.env.CRON_SECRET ?? "";
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function getAppOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
}

async function run(req: Request): Promise<Response> {
  if (!authorize(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const appOrigin = getAppOrigin();
  if (!appOrigin) {
    return new Response("NEXT_PUBLIC_APP_URL is not set", { status: 503 });
  }

  if (!process.env.RESEND_API_KEY || !process.env.NOTIFICATION_EMAIL_FROM) {
    return new Response("Email provider env not configured", { status: 503 });
  }

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit");
  const batchSize = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10) || DEFAULT_BATCH, 1), 100) : DEFAULT_BATCH;

  try {
    const supabase = getSupabaseServiceRoleClient();
    const stats = await processNotificationOutboxEmailBatch(supabase, { batchSize, appOrigin });
    return Response.json(stats);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
