import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeUuidParam } from "@/lib/board-id-param";

import { ensureBoardYandexDiskAccessToken } from "./board-yandex-disk-access-token";
import {
  diskDeleteResource,
  diskListDirectoryAll,
  YandexDiskClientError
} from "./yandex-disk-client";
import {
  logYandexDiskCleanup,
  yandexDiskClientErrorFields
} from "./yandex-disk-cleanup-logger";

/** Спец. SLA: удаление с Диска не раньше чем через 24 ч после первого обнаружения как сироты (YDB9.2). */
export const YANDEX_DISK_ORPHAN_FILE_CLEANUP_MIN_AGE_HOURS_DEFAULT = 24;

export type CleanupOrphanYandexDiskCardAttachmentFilesResult =
  | {
      ok: true;
      boardsProcessed: number;
      boardsSkippedNoToken: number;
      diskFilesDeleted: number;
      orphanObservationsRemovedResolved: number;
      orphanObservationsRemovedStale: number;
    }
  | { ok: false; message: string };

const UUID_DIR_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cardsRootPath(boardId: string): string {
  return `/doit/boards/${boardId}/cards`;
}

async function tryDeleteOrphanOnDisk(
  boardId: string,
  accessToken: string,
  diskPath: string
): Promise<boolean> {
  try {
    await diskDeleteResource(accessToken, diskPath);
    return true;
  } catch (e) {
    if (e instanceof YandexDiskClientError && e.code === "not_found") {
      return true;
    }
    logYandexDiskCleanup("warn", "orphan_disk_delete_failed", {
      board_id: boardId,
      disk_path: diskPath,
      ...yandexDiskClientErrorFields(e)
    });
    return false;
  }
}

async function removeStaleObservationsForPrefix(
  admin: SupabaseClient,
  boardId: string,
  pathPrefix: string,
  seenPaths: Set<string>
): Promise<number> {
  const { data: rows, error } = await admin
    .from("yandex_disk_orphan_attachment_paths")
    .select("id, disk_path")
    .eq("board_id", boardId)
    .like("disk_path", `${pathPrefix}%`);

  if (error) {
    logYandexDiskCleanup("error", "orphan_stale_observation_list_failed", {
      board_id: boardId,
      db_error: error.message
    });
    return 0;
  }

  const toDelete = (rows ?? []).filter((r) => {
    const p = typeof r.disk_path === "string" ? r.disk_path : "";
    return p && !seenPaths.has(p);
  });
  if (toDelete.length === 0) return 0;

  const ids = toDelete.map((r) => r.id).filter(Boolean);
  const { error: delErr } = await admin.from("yandex_disk_orphan_attachment_paths").delete().in("id", ids);
  if (delErr) {
    logYandexDiskCleanup("error", "orphan_stale_observation_delete_failed", {
      board_id: boardId,
      db_error: delErr.message
    });
    return 0;
  }
  return ids.length;
}

/**
 * Сканирует `/doit/boards/<boardId>/cards/…` на Яндекс.Диске, ищет файлы без строки `card_attachments`
 * с тем же `storage_path`, ведёт учёт в `yandex_disk_orphan_attachment_paths`, удаляет с Диска после SLA.
 * Только `service_role` (таблица недоступна с клиента).
 */
export async function cleanupOrphanYandexDiskCardAttachmentFiles(
  admin: SupabaseClient,
  options?: { boardId?: string; minAgeHours?: number }
): Promise<CleanupOrphanYandexDiskCardAttachmentFilesResult> {
  const minAgeHours =
    options?.minAgeHours ?? YANDEX_DISK_ORPHAN_FILE_CLEANUP_MIN_AGE_HOURS_DEFAULT;
  if (!Number.isFinite(minAgeHours) || minAgeHours < 1 || minAgeHours > 8760) {
    return { ok: false, message: "Некорректный интервал SLA сирот (часы)." };
  }
  const minAgeMs = Math.floor(minAgeHours) * 3600 * 1000;
  const threshold = Date.now() - minAgeMs;

  let query = admin
    .from("board_yandex_disk_integrations")
    .select("board_id, status")
    .neq("status", "disconnected");

  const singleBoard = options?.boardId ? normalizeUuidParam(options.boardId) : null;
  if (singleBoard) {
    query = query.eq("board_id", singleBoard);
  }

  const { data: integrations, error: intErr } = await query;
  if (intErr) {
    logYandexDiskCleanup("error", "orphan_integrations_list_failed", {
      db_error: intErr.message,
      single_board_only: Boolean(singleBoard)
    });
    return { ok: false, message: "Не удалось получить список интеграций Яндекс.Диска." };
  }

  const rows = (integrations ?? []) as { board_id: string; status: string }[];
  if (rows.length === 0) {
    return {
      ok: true,
      boardsProcessed: 0,
      boardsSkippedNoToken: 0,
      diskFilesDeleted: 0,
      orphanObservationsRemovedResolved: 0,
      orphanObservationsRemovedStale: 0
    };
  }

  let boardsProcessed = 0;
  let boardsSkippedNoToken = 0;
  let diskFilesDeleted = 0;
  let orphanObservationsRemovedResolved = 0;
  let orphanObservationsRemovedStale = 0;

  for (const row of rows) {
    const boardId = row.board_id;
    const token = await ensureBoardYandexDiskAccessToken(boardId, {
      cleanupDiagnostics: true
    });
    if (!token.ok) {
      boardsSkippedNoToken += 1;
      continue;
    }

    boardsProcessed += 1;
    const accessToken = token.accessToken;
    const root = cardsRootPath(boardId);

    let rootItems: Awaited<ReturnType<typeof diskListDirectoryAll>>;
    try {
      rootItems = await diskListDirectoryAll(accessToken, root);
    } catch (e) {
      logYandexDiskCleanup("warn", "orphan_disk_list_cards_root_failed", {
        board_id: boardId,
        disk_path: root,
        ...yandexDiskClientErrorFields(e)
      });
      continue;
    }

    const seenUnderRoot = new Set<string>();

    for (const item of rootItems) {
      if (item.type === "file") {
        seenUnderRoot.add(item.path);
        const r = await processPotentialOrphanFile(admin, accessToken, boardId, item.path, threshold);
        diskFilesDeleted += r.deleted;
        orphanObservationsRemovedResolved += r.resolved;
        continue;
      }
      if (item.type !== "dir" || !UUID_DIR_RE.test(item.name)) {
        continue;
      }
      const cardId = item.name;
      const cardDir = `${root}/${cardId}`;

      let files: Awaited<ReturnType<typeof diskListDirectoryAll>>;
      try {
        files = await diskListDirectoryAll(accessToken, cardDir);
      } catch (e) {
        logYandexDiskCleanup("warn", "orphan_disk_list_card_dir_failed", {
          board_id: boardId,
          card_id: cardId,
          disk_path: cardDir,
          ...yandexDiskClientErrorFields(e)
        });
        continue;
      }

      for (const f of files) {
        if (f.type !== "file") continue;
        seenUnderRoot.add(f.path);
        const r = await processPotentialOrphanFile(admin, accessToken, boardId, f.path, threshold);
        diskFilesDeleted += r.deleted;
        orphanObservationsRemovedResolved += r.resolved;
      }
    }

    orphanObservationsRemovedStale += await removeStaleObservationsForPrefix(
      admin,
      boardId,
      `${root}/`,
      seenUnderRoot
    );
  }

  if (boardsSkippedNoToken > 0) {
    logYandexDiskCleanup("warn", "orphan_cleanup_boards_skipped_aggregate", {
      boards_skipped_no_token: boardsSkippedNoToken,
      boards_processed: boardsProcessed
    });
  }

  return {
    ok: true,
    boardsProcessed,
    boardsSkippedNoToken,
    diskFilesDeleted,
    orphanObservationsRemovedResolved,
    orphanObservationsRemovedStale
  };
}

async function processPotentialOrphanFile(
  admin: SupabaseClient,
  accessToken: string,
  boardId: string,
  diskPath: string,
  thresholdTime: number
): Promise<{ deleted: number; resolved: number }> {
  const { data: att, error: attErr } = await admin
    .from("card_attachments")
    .select("id")
    .eq("board_id", boardId)
    .eq("storage_path", diskPath)
    .maybeSingle();

  if (attErr) {
    logYandexDiskCleanup("error", "orphan_attachment_lookup_failed", {
      board_id: boardId,
      disk_path: diskPath,
      db_error: attErr.message
    });
    return { deleted: 0, resolved: 0 };
  }

  if (att?.id) {
    const { data: dropped, error: delObsErr } = await admin
      .from("yandex_disk_orphan_attachment_paths")
      .delete()
      .eq("board_id", boardId)
      .eq("disk_path", diskPath)
      .select("id");
    if (delObsErr) {
      logYandexDiskCleanup("error", "orphan_observation_delete_resolved_failed", {
        board_id: boardId,
        disk_path: diskPath,
        db_error: delObsErr.message
      });
      return { deleted: 0, resolved: 0 };
    }
    return { deleted: 0, resolved: dropped?.length ?? 0 };
  }

  const { data: obs, error: obsErr } = await admin
    .from("yandex_disk_orphan_attachment_paths")
    .select("id, first_detected_at")
    .eq("board_id", boardId)
    .eq("disk_path", diskPath)
    .maybeSingle();

  if (obsErr) {
    logYandexDiskCleanup("error", "orphan_observation_select_failed", {
      board_id: boardId,
      disk_path: diskPath,
      db_error: obsErr.message
    });
    return { deleted: 0, resolved: 0 };
  }

  if (!obs) {
    const { error: insErr } = await admin.from("yandex_disk_orphan_attachment_paths").upsert(
      { board_id: boardId, disk_path: diskPath },
      { onConflict: "board_id,disk_path", ignoreDuplicates: true }
    );
    if (insErr) {
      logYandexDiskCleanup("error", "orphan_observation_upsert_failed", {
        board_id: boardId,
        disk_path: diskPath,
        db_error: insErr.message
      });
    }
    return { deleted: 0, resolved: 0 };
  }

  const first = obs.first_detected_at ? Date.parse(String(obs.first_detected_at)) : NaN;
  if (!Number.isFinite(first) || first > thresholdTime) {
    return { deleted: 0, resolved: 0 };
  }

  const { data: att2, error: att2Err } = await admin
    .from("card_attachments")
    .select("id")
    .eq("board_id", boardId)
    .eq("storage_path", diskPath)
    .maybeSingle();

  if (att2Err) {
    logYandexDiskCleanup("error", "orphan_attachment_recheck_failed", {
      board_id: boardId,
      disk_path: diskPath,
      db_error: att2Err.message
    });
    return { deleted: 0, resolved: 0 };
  }
  if (att2?.id) {
    return { deleted: 0, resolved: 0 };
  }

  const removed = await tryDeleteOrphanOnDisk(boardId, accessToken, diskPath);
  if (!removed) {
    return { deleted: 0, resolved: 0 };
  }

  const { error: delObs2 } = await admin
    .from("yandex_disk_orphan_attachment_paths")
    .delete()
    .eq("board_id", boardId)
    .eq("disk_path", diskPath);
  if (delObs2) {
    logYandexDiskCleanup("error", "orphan_observation_delete_after_disk_delete_failed", {
      board_id: boardId,
      disk_path: diskPath,
      db_error: delObs2.message
    });
  }

  return { deleted: 1, resolved: 0 };
}
