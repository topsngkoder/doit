import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireBoardYandexDiskIntegrationManagement } from "@/lib/yandex-disk/board-yandex-disk-integration-access";
import { getYandexDiskIntegrationEnv } from "@/lib/yandex-disk/integration-env";
import { verifyYandexDiskOAuthState } from "@/lib/yandex-disk/oauth-state";
import { upsertBoardYandexDiskIntegrationAfterOAuth } from "@/lib/yandex-disk/board-yandex-disk-integration-oauth-persist";
import { encryptSecret } from "@/lib/yandex-disk/token-crypto";
import {
  YandexDiskClientError,
  diskEnsureFolderChain,
  exchangeAuthorizationCodeForTokens,
  fetchLoginProfile
} from "@/lib/yandex-disk/yandex-disk-client";
import {
  mapYandexDiskClientErrorToProductMessage,
  type YandexDiskProductOperation,
  YANDEX_DISK_MSG_CANNOT_CHANGE_DISK_WITH_FILES
} from "@/lib/yandex-disk/yandex-disk-product-messages";

function boardRedirect(requestUrl: string, boardId: string, query: Record<string, string>): NextResponse {
  const u = new URL(`/boards/${boardId}`, requestUrl);
  for (const [k, v] of Object.entries(query)) {
    u.searchParams.set(k, v);
  }
  return NextResponse.redirect(u);
}

function boardsIndexRedirect(requestUrl: string, query: Record<string, string>): NextResponse {
  const u = new URL("/boards", requestUrl);
  for (const [k, v] of Object.entries(query)) {
    u.searchParams.set(k, v);
  }
  return NextResponse.redirect(u);
}

function redirectYandexClientError(
  requestUrl: string,
  boardId: string,
  err: YandexDiskClientError,
  operation: YandexDiskProductOperation
): NextResponse {
  const product = mapYandexDiskClientErrorToProductMessage(err, operation);
  console.error("Yandex Disk OAuth callback:", err.code, err.oauthGrantType ?? "", product ?? "");
  return boardRedirect(requestUrl, boardId, { yandex_disk_oauth: "provider" });
}

/**
 * OAuth callback Яндекса: обмен кода, профиль, папки `/doit/boards/<boardId>/cards/`, сохранение интеграции (`upsert` по `board_id`, YDB3.4).
 * Redirect URI должен совпадать с `YANDEX_DISK_OAUTH_REDIRECT_URI`.
 */
export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const oauthError = reqUrl.searchParams.get("error");
  const code = reqUrl.searchParams.get("code");
  const stateParam = reqUrl.searchParams.get("state");

  if (oauthError) {
    const verified = stateParam ? verifyYandexDiskOAuthState(stateParam) : { ok: false as const };
    if (verified.ok) {
      return boardRedirect(request.url, verified.boardId, { yandex_disk_oauth: "denied" });
    }
    return boardsIndexRedirect(request.url, { yandex_disk_oauth: "denied" });
  }

  if (!code?.trim() || !stateParam?.trim()) {
    const verified = stateParam ? verifyYandexDiskOAuthState(stateParam) : { ok: false as const };
    if (verified.ok) {
      return boardRedirect(request.url, verified.boardId, { yandex_disk_oauth: "invalid" });
    }
    return boardsIndexRedirect(request.url, { yandex_disk_oauth: "invalid" });
  }

  const verified = verifyYandexDiskOAuthState(stateParam);
  if (!verified.ok) {
    return boardsIndexRedirect(request.url, { yandex_disk_oauth: "invalid_state" });
  }

  const { boardId, userId } = verified;

  try {
    getYandexDiskIntegrationEnv();
  } catch {
    return boardRedirect(request.url, boardId, { yandex_disk_oauth: "config" });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/boards/${boardId}`;
    const login = new URL("/login", request.url);
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  if (user.id !== userId) {
    return boardRedirect(request.url, boardId, { yandex_disk_oauth: "session_mismatch" });
  }

  const access = await requireBoardYandexDiskIntegrationManagement(supabase, boardId);
  if (!access.ok) {
    return boardRedirect(request.url, boardId, { yandex_disk_oauth: "forbidden" });
  }

  let tokens: Awaited<ReturnType<typeof exchangeAuthorizationCodeForTokens>>;
  try {
    tokens = await exchangeAuthorizationCodeForTokens(code.trim());
  } catch (e) {
    if (e instanceof YandexDiskClientError) {
      return redirectYandexClientError(request.url, boardId, e, "oauth_authorize");
    }
    console.error("Yandex Disk OAuth callback:", e);
    return boardRedirect(request.url, boardId, { yandex_disk_oauth: "provider" });
  }

  let profile: Awaited<ReturnType<typeof fetchLoginProfile>>;
  try {
    profile = await fetchLoginProfile(tokens.accessToken);
  } catch (e) {
    if (e instanceof YandexDiskClientError) {
      return redirectYandexClientError(request.url, boardId, e, "profile");
    }
    console.error("Yandex Disk OAuth callback:", e);
    return boardRedirect(request.url, boardId, { yandex_disk_oauth: "provider" });
  }

  const { data: accountChangeAllowed, error: accountChangeRpcError } = await supabase.rpc(
    "yandex_disk_oauth_account_change_allowed",
    { p_board_id: boardId, p_new_yandex_account_id: profile.id }
  );

  if (accountChangeRpcError) {
    console.error("yandex_disk_oauth_account_change_allowed:", accountChangeRpcError.message);
    return boardRedirect(request.url, boardId, { yandex_disk_oauth: "db_error" });
  }

  if (accountChangeAllowed !== true) {
    console.warn(
      "Yandex Disk OAuth callback: account change blocked (YDB3.5)",
      YANDEX_DISK_MSG_CANNOT_CHANGE_DISK_WITH_FILES
    );
    return boardRedirect(request.url, boardId, { yandex_disk_oauth: "cannot_change_with_files" });
  }

  try {
    await diskEnsureFolderChain(tokens.accessToken, `/doit/boards/${boardId}/cards`);
  } catch (e) {
    if (e instanceof YandexDiskClientError) {
      return redirectYandexClientError(request.url, boardId, e, "integration_folder");
    }
    console.error("Yandex Disk OAuth callback:", e);
    return boardRedirect(request.url, boardId, { yandex_disk_oauth: "provider" });
  }

  const encAccess = encryptSecret(tokens.accessToken);
  const encRefresh = encryptSecret(tokens.refreshToken);
  const expiresAt = new Date(Date.now() + tokens.expiresInSeconds * 1000);
  const lastAuthorizedAt = new Date().toISOString();

  const { error: upsertError } = await upsertBoardYandexDiskIntegrationAfterOAuth({
    boardId,
    yandexAccountId: profile.id,
    yandexLogin: profile.login,
    encryptedAccessToken: encAccess,
    encryptedRefreshToken: encRefresh,
    accessTokenExpiresAtIso: expiresAt.toISOString(),
    connectedByUserId: user.id,
    lastAuthorizedAtIso: lastAuthorizedAt
  });

  if (upsertError) {
    console.error("board_yandex_disk_integrations upsert:", upsertError.message);
    return boardRedirect(request.url, boardId, { yandex_disk_oauth: "db_error" });
  }

  return boardRedirect(request.url, boardId, { yandex_disk_oauth: "success" });
}
