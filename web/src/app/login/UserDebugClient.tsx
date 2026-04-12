"use client";

type UserDebugClientProps = {
  isAuthenticated: boolean;
  userId: string | null;
};

export function UserDebugClient({ isAuthenticated, userId }: UserDebugClientProps) {
  return (
    <section className="mt-4 rounded-[var(--radius-surface)] border border-dashed border-app-default bg-app-surface-muted px-3 py-3 text-xs text-app-secondary">
      <div className="mb-1 font-medium text-app-primary">Supabase auth (server)</div>
      <p>
        Состояние: {isAuthenticated ? `авторизован (user.id = ${userId})` : "гость (user = null)"}
      </p>
    </section>
  );
}

