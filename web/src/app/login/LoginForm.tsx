"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value
      .trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement)
      .value;

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signError) {
        setError(signError.message);
        setLoading(false);
        return;
      }

      router.refresh();
      router.push("/boards");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-300">Email</span>
          <Input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-300">Пароль</span>
          <Input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </label>
      </div>
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Вход…" : "Войти"}
      </Button>
    </form>
  );
}
