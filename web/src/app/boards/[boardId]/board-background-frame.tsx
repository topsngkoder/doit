"use client";

import type { CSSProperties, ReactNode } from "react";
import * as React from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const BACKGROUND_BUCKET = "board-backgrounds";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const CACHE_TTL_MS = 55 * 60 * 1000;

function cacheKey(path: string) {
  return `doit:board-backgrounds:signed-url:${path}`;
}

function readCachedSignedUrl(path: string): { url: string; expiresAt: number } | null {
  try {
    const raw = localStorage.getItem(cacheKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url?: unknown; expiresAt?: unknown };
    if (typeof parsed.url !== "string") return null;
    if (typeof parsed.expiresAt !== "number") return null;
    if (parsed.expiresAt <= Date.now()) return null;
    return { url: parsed.url, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function writeCachedSignedUrl(path: string, url: string) {
  try {
    const payload = JSON.stringify({ url, expiresAt: Date.now() + CACHE_TTL_MS });
    localStorage.setItem(cacheKey(path), payload);
  } catch {
    // localStorage может быть недоступен (например, в приватном режиме).
  }
}

export function BoardBackgroundFrame(props: {
  backgroundType: "none" | "image";
  backgroundImagePath: string | null;
  className?: string;
  children: ReactNode;
}) {
  const { backgroundType, backgroundImagePath, className, children } = props;
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function ensureSignedUrl(path: string) {
      const cached = readCachedSignedUrl(path);
      if (cached) {
        setSignedUrl(cached.url);
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.storage.from(BACKGROUND_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
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

    if (backgroundType !== "image" || !backgroundImagePath) {
      setSignedUrl(null);
      return () => {
        cancelled = true;
      };
    }

    void ensureSignedUrl(backgroundImagePath);
    return () => {
      cancelled = true;
    };
  }, [backgroundType, backgroundImagePath]);

  const showImage = backgroundType === "image" && signedUrl;
  const surfaceClass = showImage ? "" : "bg-app-page";

  const style: CSSProperties = {};
  if (showImage) {
    style.backgroundImage = `linear-gradient(rgba(2, 6, 23, 0.25), rgba(2, 6, 23, 0.25)), url("${signedUrl}")`;
    style.backgroundSize = "cover";
    style.backgroundPosition = "center";
  }

  return (
    <section className={[className, surfaceClass].filter(Boolean).join(" ")} style={style}>
      {children}
    </section>
  );
}

