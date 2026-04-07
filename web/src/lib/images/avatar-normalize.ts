export const AVATAR_UNSUPPORTED_FILE_MESSAGE = "Файл не поддерживается на вашем устройстве";
export const AVATAR_MAX_SIDE_PX = 512;
export const AVATAR_MAX_BYTES = 102_400;
export const AVATAR_MIN_SIDE_PX = 128;
export const AVATAR_COMPRESS_FAILED_MESSAGE = "Не удалось уменьшить файл до 100 КБ";
export const AVATAR_OUTPUT_FILENAME = "avatar.jpg";
export const AVATAR_OUTPUT_MIME_TYPE = "image/jpeg";

export type NormalizedAvatarImage = {
  file: File;
  width: number;
  height: number;
  bytes: number;
};

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function decodeViaImageElement(file: File): Promise<HTMLCanvasElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(AVATAR_UNSUPPORTED_FILE_MESSAGE));
      image.src = objectUrl;
    });

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (width < 1 || height < 1) {
      throw new Error(AVATAR_UNSUPPORTED_FILE_MESSAGE);
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(AVATAR_UNSUPPORTED_FILE_MESSAGE);
    }
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function decodeAvatarImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error(AVATAR_UNSUPPORTED_FILE_MESSAGE);
  }

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width < 1 || bitmap.height < 1) {
          throw new Error(AVATAR_UNSUPPORTED_FILE_MESSAGE);
        }

        const canvas = createCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error(AVATAR_UNSUPPORTED_FILE_MESSAGE);
        }

        ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
        return canvas;
      } finally {
        bitmap.close();
      }
    } catch {
      // Fallback below for browsers/devices where createImageBitmap fails.
    }
  }

  return decodeViaImageElement(file);
}

export async function decodeAvatarFirstFrameToCanvas(file: File): Promise<HTMLCanvasElement> {
  // Browser image decoders expose a raster frame for canvas rendering.
  // For animated GIF/WEBP this effectively gives the first frame, which is the required behavior.
  return decodeAvatarImageToCanvas(file);
}

export function scaleAvatarCanvasToMaxSide(
  sourceCanvas: HTMLCanvasElement,
  maxSidePx: number = AVATAR_MAX_SIDE_PX
): HTMLCanvasElement {
  const sourceWidth = sourceCanvas.width;
  const sourceHeight = sourceCanvas.height;
  if (sourceWidth < 1 || sourceHeight < 1) {
    throw new Error(AVATAR_UNSUPPORTED_FILE_MESSAGE);
  }

  const longestSide = Math.max(sourceWidth, sourceHeight);
  if (longestSide <= maxSidePx) {
    return sourceCanvas;
  }

  const scale = maxSidePx / longestSide;
  const targetWidth = Math.max(1, Math.floor(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.floor(sourceHeight * scale));

  const scaledCanvas = createCanvas(targetWidth, targetHeight);
  const ctx = scaledCanvas.getContext("2d");
  if (!ctx) {
    throw new Error(AVATAR_UNSUPPORTED_FILE_MESSAGE);
  }

  ctx.drawImage(sourceCanvas, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);
  return scaledCanvas;
}

export function flattenAvatarCanvasOnWhite(
  sourceCanvas: HTMLCanvasElement
): HTMLCanvasElement {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (width < 1 || height < 1) {
    throw new Error(AVATAR_UNSUPPORTED_FILE_MESSAGE);
  }

  const flattenedCanvas = createCanvas(width, height);
  const ctx = flattenedCanvas.getContext("2d");
  if (!ctx) {
    throw new Error(AVATAR_UNSUPPORTED_FILE_MESSAGE);
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(sourceCanvas, 0, 0, width, height);
  return flattenedCanvas;
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, AVATAR_OUTPUT_MIME_TYPE, quality);
  });
  if (!blob) {
    throw new Error(AVATAR_COMPRESS_FAILED_MESSAGE);
  }
  return blob;
}

export async function compressAvatarCanvasToSizeLimit(
  sourceCanvas: HTMLCanvasElement,
  maxBytes: number = AVATAR_MAX_BYTES
): Promise<Blob> {
  const baseWidth = sourceCanvas.width;
  const baseHeight = sourceCanvas.height;
  if (baseWidth < 1 || baseHeight < 1) {
    throw new Error(AVATAR_COMPRESS_FAILED_MESSAGE);
  }

  let maxSide = Math.max(baseWidth, baseHeight);
  while (maxSide >= AVATAR_MIN_SIDE_PX) {
    const currentCanvas = scaleAvatarCanvasToMaxSide(sourceCanvas, maxSide);

    for (let quality = 85; quality >= 40; quality -= 5) {
      const blob = await canvasToJpegBlob(currentCanvas, quality / 100);
      if (blob.size <= maxBytes) {
        return blob;
      }
    }

    const nextMaxSide = Math.floor(maxSide * 0.9);
    if (nextMaxSide < AVATAR_MIN_SIDE_PX) {
      break;
    }
    maxSide = nextMaxSide;
  }

  throw new Error(AVATAR_COMPRESS_FAILED_MESSAGE);
}

export async function normalizeAvatarImage(file: File): Promise<NormalizedAvatarImage> {
  const decodedCanvas = await decodeAvatarFirstFrameToCanvas(file);
  const scaledCanvas = scaleAvatarCanvasToMaxSide(decodedCanvas, AVATAR_MAX_SIDE_PX);
  const flattenedCanvas = flattenAvatarCanvasOnWhite(scaledCanvas);
  const jpegBlob = await compressAvatarCanvasToSizeLimit(flattenedCanvas, AVATAR_MAX_BYTES);

  const normalizedFile = new File([jpegBlob], AVATAR_OUTPUT_FILENAME, {
    type: AVATAR_OUTPUT_MIME_TYPE
  });

  return {
    file: normalizedFile,
    width: flattenedCanvas.width,
    height: flattenedCanvas.height,
    bytes: normalizedFile.size
  };
}
