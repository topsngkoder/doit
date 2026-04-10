"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { Theme } from "@/lib/theme";
import { useTheme } from "@/lib/theme";

export function ProfileThemeSection() {
  const { theme, setTheme } = useTheme();

  const choose = React.useCallback(
    (next: Theme) => {
      setTheme(next);
    },
    [setTheme]
  );

  return (
    <section
      className="surface-card p-4 sm:p-5"
      aria-labelledby="profile-theme-heading"
    >
      <h2
        id="profile-theme-heading"
        className="text-sm font-semibold text-app-primary"
      >
        Тема интерфейса
      </h2>
      <p className="mt-1 text-xs text-app-tertiary">
        Выбор сохраняется в этом браузере и применяется сразу.
      </p>
      <div
        role="radiogroup"
        aria-labelledby="profile-theme-heading"
        className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        <ThemeChoiceButton
          label="Тёмная"
          value="dark"
          selected={theme === "dark"}
          onChoose={choose}
        />
        <ThemeChoiceButton
          label="Светлая"
          value="light"
          selected={theme === "light"}
          onChoose={choose}
        />
      </div>
    </section>
  );
}

function ThemeChoiceButton({
  label,
  value,
  selected,
  onChoose
}: {
  label: string;
  value: Theme;
  selected: boolean;
  onChoose: (theme: Theme) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onChoose(value)}
      className={cn(
        "focus-ring-app rounded-[var(--radius-control)] border px-4 py-2.5 text-left text-sm font-medium transition-colors",
        selected ?
          "border-app-accent bg-app-surface-muted text-app-primary"
        : "border-app-default text-app-secondary hover:bg-app-surface-muted"
      )}
    >
      {label}
    </button>
  );
}
