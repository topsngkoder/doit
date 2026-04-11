import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildBoardsWithPermissions } from "./board-permissions";
import type { BoardsPageData } from "./types";
import { createBoardWithDefaultsAction } from "./actions";
import { BoardsDefaultSelector } from "./boards-default-selector";
import { yandexDiskOauthReturnBannerMessage } from "@/lib/yandex-disk/yandex-disk-product-messages";

type BoardsPageProps = {
  searchParams: Promise<{ boardError?: string; yandex_disk_oauth?: string | string[] }>;
};

export default async function BoardsPage({ searchParams }: BoardsPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  const isSessionMissing = error?.message === "Auth session missing!";
  const isAuthenticated = !!user && !(error && !isSessionMissing);

  if (!isAuthenticated) {
    redirect("/login");
  }

  const { error: acceptInvitesError } = await supabase.rpc(
    "accept_pending_board_invites_for_current_user"
  );

  const sp = await searchParams;
  const boardError = sp.boardError;
  const oauthRaw = sp.yandex_disk_oauth;
  const oauthFlag = Array.isArray(oauthRaw) ? oauthRaw[0] : oauthRaw;
  const yandexDiskOauthBanner = yandexDiskOauthReturnBannerMessage(oauthFlag);

  const { data: boards, error: boardsError } = await supabase
    .from("boards")
    .select("id, name, created_at, owner_user_id")
    .order("created_at", { ascending: false });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_board_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: isSystemAdmin, error: isSystemAdminError } = await supabase.rpc("is_system_admin");

  const boardsWithPermissions = await buildBoardsWithPermissions({
    boards,
    currentUserId: user.id,
    isSystemAdmin: !!isSystemAdmin,
    hasBoardPermissionRpc: async (args) => {
      const { data, error } = await supabase.rpc("has_board_permission", args);
      return {
        data,
        error: error ? { message: error.message } : null
      };
    }
  });

  const boardsPageData: BoardsPageData = {
    boards: boardsWithPermissions ?? [],
    default_board_id: profile?.default_board_id ?? null
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 pt-16 sm:pt-24 lg:pt-28">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-app-primary">
          Доски
        </h1>
      </header>

      {yandexDiskOauthBanner ? (
        <div
          className="rounded-md border border-app-divider bg-app-surface-muted px-3 py-2 text-sm text-app-secondary"
          role="status"
        >
          {yandexDiskOauthBanner}
        </div>
      ) : null}

      {boardError ? (
        <Toast title="Не удалось создать доску" message={boardError} variant="error" />
      ) : null}

      {acceptInvitesError ? (
        <Toast
          title="Не удалось применить приглашения"
          message={acceptInvitesError.message}
          variant="error"
        />
      ) : null}

      {boardsError ? (
        <Toast
          title="Ошибка загрузки досок"
          message={boardsError.message}
          variant="error"
        />
      ) : null}

      {profileError ? (
        <Toast
          title="Ошибка загрузки профиля"
          message={profileError.message}
          variant="error"
        />
      ) : null}

      {isSystemAdminError ? (
        <Toast
          title="Ошибка проверки прав"
          message={isSystemAdminError.message}
          variant="error"
        />
      ) : null}

      <section className="surface-card space-y-4 px-4 py-5 text-sm text-app-primary">
        <form action={createBoardWithDefaultsAction} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-xs text-app-tertiary">Название новой доски</span>
            <input
              name="name"
              type="text"
              maxLength={100}
              required
              placeholder="Например, Продукт"
              className="field-base"
            />
          </label>
          <Button type="submit" size="sm">
            Создать доску
          </Button>
        </form>

        <div className="border-t border-app-divider pt-4">
          {boardsPageData.boards.length === 0 ? (
            <p className="text-app-secondary">Пока нет досок. Создайте первую выше.</p>
          ) : (
            <BoardsDefaultSelector
              boards={boardsPageData.boards}
              initialDefaultBoardId={boardsPageData.default_board_id}
            />
          )}
        </div>
      </section>
    </main>
  );
}
