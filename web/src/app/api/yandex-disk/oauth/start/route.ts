import { NextResponse } from "next/server";

import { normalizeBoardIdQueryParam } from "@/lib/board-id-param";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireBoardYandexDiskIntegrationManagement } from "@/lib/yandex-disk/board-yandex-disk-integration-access";
import { getYandexDiskIntegrationEnv } from "@/lib/yandex-disk/integration-env";
import { signYandexDiskOAuthState } from "@/lib/yandex-disk/oauth-state";

/**
 * Права на Диск по документации Яндекса (отдельные scope; значения вроде cloud_api:disk.read_write не существуют → invalid_scope).
 * @see https://yandex.com/dev/disk-api/doc/en/concepts/quickstart
 */
const YANDEX_DISK_OAUTH_SCOPE = "cloud_api:disk.read cloud_api:disk.write";

/**
 * Старт OAuth Яндекса для привязки Диска к доске (только владелец; из настроек доски — ссылка сюда).
 * GET ?boardId=&lt;uuid&gt; (допускается и board_id=…, UUID с черточками или 32 hex).
 */
export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const boardId =
    normalizeBoardIdQueryParam(reqUrl.searchParams.get("boardId")) ??
    normalizeBoardIdQueryParam(reqUrl.searchParams.get("board_id"));

  if (!boardId) {
    return NextResponse.redirect(new URL("/boards", request.url));
  }

  let env: ReturnType<typeof getYandexDiskIntegrationEnv>;
  try {
    env = getYandexDiskIntegrationEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Яндекс.Диск: ошибка конфигурации сервера.";
    return new Response(msg, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const access = await requireBoardYandexDiskIntegrationManagement(supabase, boardId);
  if (!access.ok) {
    return NextResponse.redirect(new URL(`/boards/${boardId}`, request.url));
  }

  const state = signYandexDiskOAuthState(boardId, access.userId);
  const authorizeUrl = new URL("https://oauth.yandex.com/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", env.oauthClientId);
  authorizeUrl.searchParams.set("redirect_uri", env.oauthRedirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", YANDEX_DISK_OAUTH_SCOPE);

  return NextResponse.redirect(authorizeUrl.toString());
}
