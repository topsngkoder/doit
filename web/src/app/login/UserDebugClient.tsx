"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type UserDebugState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; isAuthenticated: boolean; userId: string | null }
  | { status: "error"; message: string };

export function UserDebugClient() {
  const [state, setState] = useState<UserDebugState>({ status: "idle" });

  useEffect(() => {
    async function loadUser() {
      setState({ status: "loading" });

      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
          error
        } = await supabase.auth.getUser();

        // "Auth session missing!" — нормально для гостя (никто не залогинен)
        if (error && error.message !== "Auth session missing!") {
          setState({ status: "error", message: error.message });
          return;
        }

        setState({
          status: "success",
          isAuthenticated: !!user,
          userId: user?.id ?? null
        });
      } catch (error: any) {
        setState({
          status: "error",
          message: error?.message ?? "Неизвестная ошибка"
        });
      }
    }

    void loadUser();
  }, []);

  return (
    <section className="mt-4 rounded-[length:var(--radius-surface)] border border-dashed border-app-default bg-app-surface-muted px-3 py-3 text-xs text-app-secondary">
      <div className="mb-1 font-medium text-app-primary">Supabase auth (client)</div>
      {state.status === "idle" || state.status === "loading" ? (
        <p>Загрузка информации о пользователе…</p>
      ) : null}
      {state.status === "error" ? (
        <p className="text-app-validation-error">Ошибка: {state.message}</p>
      ) : null}
      {state.status === "success" ? (
        <p>
          Состояние:{" "}
          {state.isAuthenticated
            ? `авторизован (user.id = ${state.userId})`
            : "гость (user = null)"}
        </p>
      ) : null}
    </section>
  );
}

