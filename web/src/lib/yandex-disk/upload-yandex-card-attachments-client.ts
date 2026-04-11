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
};

export type YandexCardAttachmentUploadClientFileResult =
  | { originalName: string; ok: true }
  | { originalName: string; ok: false; message: string };

export type YandexCardAttachmentUploadClientResult =
  | { ok: false; message: string }
  | { ok: true; files: YandexCardAttachmentUploadClientFileResult[] };

type XhrJson = {
  ok?: boolean;
  message?: string;
  files?: YandexCardAttachmentUploadClientFileResult[];
};

const EMA_ALPHA = 0.35;

function postFormDataWithProgress(
  url: string,
  formData: FormData,
  options: {
    onProgress: (p: YandexCardAttachmentUploadProgress) => void;
    fileIndex: number;
    fileCount: number;
    fileName: string;
    /** Если известен (обычно `File.size`), для фазы `server` показываем 100% тела запроса. */
    knownFileSize: number | null;
    signal?: AbortSignal;
  }
): Promise<{ status: number; text: string }> {
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
        smoothedSpeedBps: emaSpeed
      });
    };

    xhr.upload.onload = () => {
      if (options.signal?.aborted) return;
      const total = options.knownFileSize && options.knownFileSize > 0 ? options.knownFileSize : null;
      const loaded = total !== null ? total : lastLoaded;
      options.onProgress({
        fileIndex: options.fileIndex,
        fileCount: options.fileCount,
        fileName: options.fileName,
        phase: "server",
        loaded,
        total,
        smoothedSpeedBps: null
      });
    };

    xhr.onload = () => {
      options.signal?.removeEventListener("abort", abort);
      resolve({ status: xhr.status, text: xhr.responseText ?? "" });
    };

    xhr.onerror = () => {
      options.signal?.removeEventListener("abort", abort);
      reject(new Error("network"));
    };

    xhr.onabort = () => {
      options.signal?.removeEventListener("abort", abort);
      reject(new Error("aborted"));
    };

    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

/**
 * Последовательно загружает файлы (по одному POST) для показа прогресса и скорости по текущему файлу.
 */
export async function uploadYandexCardAttachmentsWithProgress(
  url: string,
  params: {
    fieldDefinitionId: string;
    files: File[];
    onProgress: (p: YandexCardAttachmentUploadProgress) => void;
    signal?: AbortSignal;
  }
): Promise<YandexCardAttachmentUploadClientResult> {
  const { fieldDefinitionId, files, onProgress, signal } = params;
  const fileCount = files.length;
  const merged: YandexCardAttachmentUploadClientFileResult[] = [];

  for (let i = 0; i < files.length; i += 1) {
    if (signal?.aborted) {
      return { ok: false, message: "Загрузка прервана." };
    }
    const file = files[i];
    const fd = new FormData();
    fd.set("field_definition_id", fieldDefinitionId);
    fd.append("files", file);

    const knownFileSize = file.size > 0 ? file.size : null;

    try {
      const { status, text } = await postFormDataWithProgress(url, fd, {
        fileIndex: i,
        fileCount,
        fileName: file.name,
        knownFileSize,
        signal,
        onProgress
      });

      let json: XhrJson;
      try {
        json = JSON.parse(text) as XhrJson;
      } catch {
        return {
          ok: false,
          message:
            status === 401 ? "Требуется войти в аккаунт."
            : status >= 500 ?
              "Сервер временно недоступен. Попробуйте позже."
            : "Не удалось разобрать ответ сервера."
        };
      }

      if (!json || typeof json.ok !== "boolean") {
        return { ok: false, message: "Не удалось разобрать ответ сервера." };
      }

      if (!json.ok) {
        return { ok: false, message: String(json.message ?? "Ошибка загрузки.") };
      }

      if (!Array.isArray(json.files)) {
        return { ok: false, message: "Не удалось разобрать ответ сервера." };
      }

      merged.push(...json.files);
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
