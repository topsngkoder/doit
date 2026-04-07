"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import { normalizeAvatarImage } from "@/lib/images/avatar-normalize";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AvatarMutationResult } from "./actions";

const AVATARS_BUCKET = "avatars";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const CACHE_TTL_MS = 55 * 60 * 1000;

function cacheKey(path: string) {
  return `doit:avatars:signed-url:${path}`;
}

function readCachedSignedUrl(path: string): string | null {
  try {
    const raw = localStorage.getItem(cacheKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url?: unknown; expiresAt?: unknown };
    if (typeof parsed.url !== "string") return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) return null;
    return parsed.url;
  } catch {
    return null;
  }
}

function writeCachedSignedUrl(path: string, url: string) {
  try {
    localStorage.setItem(
      cacheKey(path),
      JSON.stringify({ url, expiresAt: Date.now() + CACHE_TTL_MS })
    );
  } catch {
    // ignore localStorage errors
  }
}

function deleteCachedSignedUrl(path: string) {
  try {
    localStorage.removeItem(cacheKey(path));
  } catch {
    // ignore localStorage errors
  }
}

type Props = {
  userId: string;
  initialAvatarPath: string | null;
  email: string | null;
  displayName: string | null;
  uploadAvatarAction: (file: File) => Promise<AvatarMutationResult>;
  deleteAvatarAction: () => Promise<AvatarMutationResult>;
};

export function ProfileAvatar({
  userId,
  initialAvatarPath,
  email,
  displayName,
  uploadAvatarAction,
  deleteAvatarAction
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [avatarPath, setAvatarPath] = useState<string | null>(initialAvatarPath);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; variant: "success" | "error" } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSignedUrl(path: string) {
      const cached = readCachedSignedUrl(path);
      if (cached) {
        setSignedUrl(cached);
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.storage
          .from(AVATARS_BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setSignedUrl(null);
          return;
        }
        writeCachedSignedUrl(path, data.signedUrl);
        setSignedUrl(data.signedUrl);
      } catch {
        if (!cancelled) setSignedUrl(null);
      }
    }

    if (!avatarPath) {
      setSignedUrl(null);
      return () => {
        cancelled = true;
      };
    }

    void loadSignedUrl(avatarPath);
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  function openPicker() {
    if (isPending) return;
    inputRef.current?.click();
  }

  function onDeleteAvatar() {
    if (!avatarPath || isPending) return;
    setMessage(null);
    startTransition(async () => {
      const prevPath = avatarPath;
      const result = await deleteAvatarAction();
      if (!result.ok) {
        setMessage({ text: result.message, variant: "error" });
        return;
      }
      deleteCachedSignedUrl(prevPath);
      setAvatarPath(null);
      setSignedUrl(null);
      setMessage({ text: "Аватар удален", variant: "success" });
      setIsDeleteConfirmOpen(false);
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected || isPending) return;

    setMessage(null);
    startTransition(async () => {
      try {
        const normalized = await normalizeAvatarImage(selected);
        const result = await uploadAvatarAction(normalized.file);
        if (!result.ok) {
          setMessage({ text: result.message, variant: "error" });
          return;
        }

        const nextPath = `${userId}/avatar.jpg`;
        setAvatarPath(nextPath);

        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.storage
          .from(AVATARS_BUCKET)
          .createSignedUrl(nextPath, SIGNED_URL_TTL_SECONDS);
        if (!error && data?.signedUrl) {
          writeCachedSignedUrl(nextPath, data.signedUrl);
          setSignedUrl(data.signedUrl);
        }

        setMessage({ text: "Аватар загружен", variant: "success" });
      } catch (error) {
        const text = error instanceof Error ? error.message : "Не удалось загрузить аватар. Повторите попытку";
        setMessage({ text, variant: "error" });
      }
    });
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="relative h-24 w-24 shrink-0">
          <button
            type="button"
            onClick={openPicker}
            disabled={isPending}
            className="h-24 w-24 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 transition hover:border-sky-500/70 disabled:cursor-not-allowed disabled:opacity-70"
            aria-label="Загрузить аватар"
            title="Нажмите, чтобы загрузить аватар"
          >
            {signedUrl ? (
              <img src={signedUrl} alt="Аватар профиля" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">Нет фото</div>
            )}
          </button>
          {avatarPath ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsDeleteConfirmOpen(true);
              }}
              disabled={isPending}
              className="absolute -right-2 -top-2 rounded-full border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-xs text-slate-400 transition hover:text-rose-400 disabled:opacity-70"
              aria-label="Удалить аватар"
              title="Удалить аватар"
            >
              ✕
            </button>
          ) : null}
        </div>

        <div className="min-w-[220px] flex-1 space-y-2">
          <div>
            <div className="text-xs text-slate-400">Email</div>
            <div className="text-sm text-slate-100">{email ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Отображаемое имя</div>
            <div className="text-sm text-slate-100">{displayName?.trim() || "—"}</div>
          </div>
          <div className="text-xs text-slate-500">{isPending ? "Обработка..." : " "}</div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />

      {message ? (
        <Toast
          title={message.variant === "success" ? "Успешно" : "Ошибка"}
          message={message.text}
          variant={message.variant}
        />
      ) : null}

      <Modal
        open={isDeleteConfirmOpen}
        title="Удалить аватар?"
        onClose={() => {
          if (!isPending) setIsDeleteConfirmOpen(false);
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">Вы уверены, что хотите удалить аватар?</p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              Отмена
            </Button>
            <Button type="button" size="sm" disabled={isPending} onClick={onDeleteAvatar}>
              Удалить
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

