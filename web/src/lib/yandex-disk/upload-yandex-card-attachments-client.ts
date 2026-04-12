/**
 * Клиентская загрузка вложений с `XMLHttpRequest.upload.onprogress` (спец. 13.5 / YDB8.7).
 * Не импортировать из server-only модулей.
 */

export type YandexCardAttachmentUploadProgress = {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  phase: "client" | "server";
  loaded: number;
  total: number | null;
  /** Сглаженная скорость передачи на клиент→сервер, байт/с (скользящее сглаживание). */
  smoothedSpeedBps: number | null;
  /**
   * 0–100: заполнение полосы. На клиенте — до ~88% по реальным байтам тела запроса;
   * после отправки тела — плавное приближение к 99% на время обработки на сервере (не равно байтам на Яндекс.Диск).
   */
  barPercent: number;
  /** Только `phase === "server"`: успокаивающий текст для пользователя. */
  serverStatusText?: string;
};

/** Сообщение на фазе ожидания ответа сервера (после отправки тела запроса). */
export const YANDEX_CARD_ATTACHMENT_UPLOAD_SERVER_PHASE_MESSAGE =
  "Файл скоро появится. Можно закрыть окно.";

/** Верхняя доля полосы до завершения передачи тела (остальное — визуализация ожидания сервера). */
const BAR_CLIENT_MAX_PERCENT = 88;

export type YandexCardAttachmentUploadClientFileResult =
  | { originalName: string; ok: true }
  | { originalName: string; ok: false; message: string };

export type YandexCardAttachmentUploadClientResult =
  | { ok: false; message: string }
  | { ok: true; files: YandexCardAttachmentUploadClientFileResult[] };

type PrepareJson =
  | { ok: false; message?: string }
  | { ok: true; file?: { attachmentId?: string; uploadUrl?: string; uploadMethod?: string } };

type CompleteJson = { ok?: boolean; message?: string; retryable?: boolean };

type FailJson = { ok?: boolean; message?: string };

const EMA_ALPHA = 0.35;

function clientBarPercent(
  loaded: number,
  total: number | null,
  knownFileSize: number | null
): number {
  const denom =
    total !== null && total > 0 ? total
    : knownFileSize !== null && knownFileSize > 0 ? knownFileSize
    : null;
  if (denom !== null) {
    return Math.min(
      BAR_CLIENT_MAX_PERCENT,
      Math.round((BAR_CLIENT_MAX_PERCENT * loaded) / denom)
    );
  }
  if (loaded <= 0) return 8;
  const eased = 1 - Math.exp(-loaded / (4 * 1024 * 1024));
  return Math.min(BAR_CLIENT_MAX_PERCENT - 6, Math.round(12 + 70 * eased));
}

function serverBarPercent(elapsedMs: number): number {
  const span = 99 - BAR_CLIENT_MAX_PERCENT;
  const t = elapsedMs / 1000;
  const ease = 1 - Math.exp(-t / 3.2);
  return Math.min(99, BAR_CLIENT_MAX_PERCENT + span * ease);
}

async function postJson(
  url: string,
  body: unknown,
  options?: { signal?: AbortSignal }
): Promise<{ status: number; json: unknown | null }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options?.signal
    });
    const status = res.status;
    let json: unknown | null = null;
    try {
      json = (await res.json()) as unknown;
    } catch {
      json = null;
    }
    return { status, json };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("aborted");
    }
    throw new Error("network");
  }
}

function putFileWithProgress(
  uploadUrl: string,
  uploadMethod: string,
  file: File,
  options: {
    onProgress: (p: YandexCardAttachmentUploadProgress) => void;
    fileIndex: number;
    fileCount: number;
    fileName: string;
    /** Если известен (обычно `File.size`), для фазы `server` показываем 100% тела запроса. */
    knownFileSize: number | null;
    signal?: AbortSignal;
  }
): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastT = performance.now();
    let lastLoaded = 0;
    let emaSpeed: number | null = null;

    const abort = () => {
      xhr.abort();
    };
    options.signal?.addEventListener("abort", abort, { once: true });

    xhr.upload.onprogress = (ev) => {
      if (options.signal?.aborted) return;
      const now = performance.now();
      const dt = (now - lastT) / 1000;
      const loaded = ev.loaded;
      const total = ev.lengthComputable ? ev.total : null;
      if (dt >= 0.05 && loaded >= lastLoaded) {
        const dBytes = loaded - lastLoaded;
        const inst = dBytes / dt;
        emaSpeed = emaSpeed === null ? inst : emaSpeed * (1 - EMA_ALPHA) + inst * EMA_ALPHA;
        lastT = now;
        lastLoaded = loaded;
      }
      options.onProgress({
        fileIndex: options.fileIndex,
        fileCount: options.fileCount,
        fileName: options.fileName,
        phase: "client",
        loaded,
        total,
        smoothedSpeedBps: emaSpeed,
        barPercent: clientBarPercent(loaded, total, options.knownFileSize)
      });
    };

    xhr.onload = () => {
      options.signal?.removeEventListener("abort", abort);
      resolve({ status: xhr.status, responseText: xhr.responseText ?? "" });
    };

    xhr.onerror = () => {
      options.signal?.removeEventListener("abort", abort);
      reject(new Error("network"));
    };

    xhr.onabort = () => {
      options.signal?.removeEventListener("abort", abort);
      reject(new Error("aborted"));
    };

    xhr.open(uploadMethod, uploadUrl);
    // В upload URL Яндекса cookies приложения не участвуют.
    if (file.type) {
      xhr.setRequestHeader("Content-Type", file.type);
    } else {
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
    }
    xhr.send(file);
  });
}

function startServerPhaseProgressLoop(
  options: {
    onProgress: (p: YandexCardAttachmentUploadProgress) => void;
    fileIndex: number;
    fileCount: number;
    fileName: string;
    knownFileSize: number | null;
    signal?: AbortSignal;
  }
): { stop: () => void } {
  const total = options.knownFileSize && options.knownFileSize > 0 ? options.knownFileSize : null;
  const loaded = total !== null ? total : 0;
  const startedAt = performance.now();
  const emit = () => {
    if (options.signal?.aborted) return;
    const elapsed = performance.now() - startedAt;
    options.onProgress({
      fileIndex: options.fileIndex,
      fileCount: options.fileCount,
      fileName: options.fileName,
      phase: "server",
      loaded,
      total,
      smoothedSpeedBps: null,
      barPercent: serverBarPercent(elapsed),
      serverStatusText: YANDEX_CARD_ATTACHMENT_UPLOAD_SERVER_PHASE_MESSAGE
    });
  };
  emit();
  const interval = setInterval(emit, 180);
  return { stop: () => clearInterval(interval) };
}

async function completeWithRetry(
  url: string,
  body: unknown,
  options: {
    signal?: AbortSignal;
    onServerWaitTick?: () => void;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (options.signal?.aborted) throw new Error("aborted");
    options.onServerWaitTick?.();
    const { status, json } = await postJson(url, body, { signal: options.signal });
    const parsed = (json ?? null) as CompleteJson | null;
    if (parsed && parsed.ok === true) return { ok: true };

    const msg =
      parsed && typeof parsed.message === "string" && parsed.message.trim() ?
        parsed.message
      : status === 401 ? "Требуется войти в аккаунт."
      : status >= 500 ? "Сервер временно недоступен. Попробуйте позже."
      : "Не удалось завершить загрузку.";

    const retryable = Boolean(parsed && parsed.retryable) || status === 409;
    if (!retryable) return { ok: false, message: msg };

    // Небольшая задержка; сервер сам ждёт появления файла, но иногда требуется повтор.
    await new Promise((r) => setTimeout(r, 700));
  }
  return { ok: false, message: "Файл ещё обрабатывается. Попробуйте обновить карточку через минуту." };
}

async function bestEffortFailUpload(
  url: string,
  body: unknown,
  options?: { signal?: AbortSignal }
): Promise<void> {
  try {
    const { status, json } = await postJson(url, body, { signal: options?.signal });
    const parsed = (json ?? null) as FailJson | null;
    if (status >= 200 && status < 300 && parsed && parsed.ok === true) return;
  } catch {
    // ignore
  }
}

/**
 * Последовательно загружает файлы (по одному POST) для показа прогресса и скорости по текущему файлу.
 */
export async function uploadYandexCardAttachmentsWithProgress(
  urls: {
    prepareUrl: string;
    completeUrl: string;
    failUrl: string;
  },
  params: {
    fieldDefinitionId: string;
    files: File[];
    onProgress: (p: YandexCardAttachmentUploadProgress) => void;
    signal?: AbortSignal;
  }
): Promise<YandexCardAttachmentUploadClientResult> {
  const { prepareUrl, completeUrl, failUrl } = urls;
  const { fieldDefinitionId, files, onProgress, signal } = params;
  const fileCount = files.length;
  const merged: YandexCardAttachmentUploadClientFileResult[] = [];

  for (let i = 0; i < files.length; i += 1) {
    if (signal?.aborted) {
      return { ok: false, message: "Загрузка прервана." };
    }
    const file = files[i];
    const knownFileSize = file.size > 0 ? file.size : null;

    try {
      const { status: prepStatus, json: prepJson } = await postJson(
        prepareUrl,
        {
          field_definition_id: fieldDefinitionId,
          file: { name: file.name, size: file.size, type: file.type || null }
        },
        { signal }
      );

      const prep = (prepJson ?? null) as PrepareJson | null;
      if (!prep || typeof prep !== "object" || typeof (prep as any).ok !== "boolean") {
        return { ok: false, message: "Не удалось разобрать ответ сервера." };
      }
      if ((prep as any).ok !== true) {
        const m =
          typeof (prep as any).message === "string" && (prep as any).message.trim() ?
            String((prep as any).message)
          : prepStatus === 401 ? "Требуется войти в аккаунт."
          : prepStatus >= 500 ? "Сервер временно недоступен. Попробуйте позже."
          : "Не удалось подготовить загрузку.";
        return { ok: false, message: m };
      }

      const attachmentId = String((prep as any).file?.attachmentId ?? "").trim();
      const uploadUrl = String((prep as any).file?.uploadUrl ?? "").trim();
      const uploadMethod = String((prep as any).file?.uploadMethod ?? "PUT").trim() || "PUT";
      if (!attachmentId || !uploadUrl) {
        return { ok: false, message: "Не удалось подготовить загрузку." };
      }

      const { status: putStatus } = await putFileWithProgress(uploadUrl, uploadMethod, file, {
        fileIndex: i,
        fileCount,
        fileName: file.name,
        knownFileSize,
        signal,
        onProgress
      });
      if (putStatus < 200 || putStatus >= 300) {
        await bestEffortFailUpload(failUrl, {
          field_definition_id: fieldDefinitionId,
          attachment_id: attachmentId
        });
        merged.push({
          originalName: file.name,
          ok: false,
          message: "Не удалось загрузить файл в Яндекс.Диск."
        });
        continue;
      }

      const serverLoop = startServerPhaseProgressLoop({
        fileIndex: i,
        fileCount,
        fileName: file.name,
        knownFileSize,
        signal,
        onProgress
      });
      const completed = await completeWithRetry(
        completeUrl,
        { field_definition_id: fieldDefinitionId, attachment_id: attachmentId },
        { signal }
      );
      serverLoop.stop();

      if (!completed.ok) {
        await bestEffortFailUpload(failUrl, {
          field_definition_id: fieldDefinitionId,
          attachment_id: attachmentId
        });
        merged.push({ originalName: file.name, ok: false, message: completed.message });
        continue;
      }

      merged.push({ originalName: file.name, ok: true });
    } catch (e) {
      if (e instanceof Error && e.message === "aborted") {
        return { ok: false, message: "Загрузка прервана." };
      }
      return { ok: false, message: "Сеть недоступна или запрос прерван." };
    }
  }

  return { ok: true, files: merged };
}

/** Человекочитаемая скорость (Ру): Б/с, КиБ/с, МиБ/с. */
export function formatUploadSpeedRu(bps: number): string {
  if (!Number.isFinite(bps) || bps < 0) return "—";
  if (bps < 768) {
    return `${Math.round(bps)} Б/с`;
  }
  const kib = bps / 1024;
  if (kib < 768) {
    return `${kib.toLocaleString("ru-RU", { maximumFractionDigits: kib < 10 ? 1 : 0 })} КиБ/с`;
  }
  const mib = kib / 1024;
  return `${mib.toLocaleString("ru-RU", { maximumFractionDigits: mib < 10 ? 1 : 0 })} МиБ/с`;
}

/** Размер в Б / КиБ / МиБ / ГиБ для строки прогресса. */
export function formatByteProgressRu(loaded: number, total: number): string {
  const fmt = (n: number) => {
    if (n < 1024) return `${n} Б`;
    if (n < 1024 * 1024) {
      return `${(n / 1024).toLocaleString("ru-RU", { maximumFractionDigits: n < 10240 ? 1 : 0 })} КиБ`;
    }
    if (n < 1024 * 1024 * 1024) {
      return `${(n / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: n < 10485760 ? 1 : 0 })} МиБ`;
    }
    return `${(n / 1024 / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: n < 10737418240 ? 1 : 0 })} ГиБ`;
  };
  return `${fmt(loaded)} / ${fmt(total)}`;
}
