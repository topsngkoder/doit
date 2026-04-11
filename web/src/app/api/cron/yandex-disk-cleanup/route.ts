import { normalizeUuidParam } from "@/lib/board-id-param";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { cleanupFailedCardAttachmentsOlderThan } from "@/lib/yandex-disk/cleanup-failed-card-attachments";
import { cleanupOrphanYandexDiskCardAttachmentFiles } from "@/lib/yandex-disk/cleanup-orphan-yandex-disk-card-attachment-files";
import { logYandexDiskCleanup } from "@/lib/yandex-disk/yandex-disk-cleanup-logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function cronSecret(): string {
  return (
    process.env.YANDEX_DISK_CLEANUP_CRON_SECRET ??
    process.env.NOTIFICATION_OUTBOX_CRON_SECRET ??
    process.env.CRON_SECRET ??
    ""
  );
}

function authorize(req: Request): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function parseMinAgeHours(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

async function run(req: Request): Promise<Response> {
  if (!authorize(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const minAgeHours = parseMinAgeHours(url.searchParams.get("minAgeHours"));
  const boardParam = url.searchParams.get("boardId");
  const boardId = boardParam ? normalizeUuidParam(boardParam) : null;
  if (boardParam && !boardId) {
    return Response.json({ error: "Некорректный boardId." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    const failedAttachments = await cleanupFailedCardAttachmentsOlderThan(supabase, {
      minAgeHours
    });

    const orphanDiskFiles = await cleanupOrphanYandexDiskCardAttachmentFiles(supabase, {
      minAgeHours,
      ...(boardId ? { boardId } : {})
    });

    if (!failedAttachments.ok) {
      logYandexDiskCleanup("warn", "cron_failed_attachments_step_failed", {
        min_age_hours: minAgeHours ?? null,
        board_id_filter: boardId
      });
    }
    if (!orphanDiskFiles.ok) {
      logYandexDiskCleanup("warn", "cron_orphan_disk_step_failed", {
        min_age_hours: minAgeHours ?? null,
        board_id_filter: boardId
      });
    }

    return Response.json({
      failedAttachments,
      orphanDiskFiles
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    logYandexDiskCleanup("error", "cron_run_unhandled_exception", {
      error_name: e instanceof Error ? e.name : "non_error"
    });
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
