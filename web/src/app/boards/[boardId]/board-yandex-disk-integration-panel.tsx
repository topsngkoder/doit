"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BoardYandexDiskIntegrationSnapshot } from "@/lib/board-snapshot-types";
import { yandexDiskOAuthStartPath } from "@/lib/yandex-disk/yandex-disk-board-ui-endpoints";
import {
  formatYandexDiskLastAuthorizedAtRu,
  getYandexDiskIntegrationModalPresentation,
  safeYandexDiskIntegrationLastErrorTextForOwner,
  YANDEX_DISK_UI_OWNER_ONLY_INTEGRATION_MANAGEMENT
} from "@/lib/yandex-disk/yandex-disk-integration-modal-presentation";

import { disconnectBoardYandexDiskIntegrationAction } from "./board-yandex-disk-ui-server-contract";

const oauthLinkBase =
  "inline-flex h-8 items-center justify-center rounded-[var(--radius-control)] px-3 text-xs font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)]";

const oauthLinkPrimaryClass = cn(
  oauthLinkBase,
  "bg-[var(--accent-bg)] text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)]"
);

const oauthLinkSecondaryClass = cn(
  oauthLinkBase,
  "border border-[var(--button-secondary-border)] bg-[var(--btn-secondary-bg)] text-[var(--text-secondary)] hover:border-[var(--button-secondary-border-hover)] hover:bg-[var(--btn-secondary-hover-bg)]"
);

function ownerIntegrationActionFlags(integration: BoardYandexDiskIntegrationSnapshot) {
  const hasRow = integration != null;
  const status = integration?.status;

  const showConnect = !hasRow || status === "disconnected";
  const showReauthorize = hasRow && (status === "reauthorization_required" || status === "error");
  const showRefreshOAuth = hasRow && status === "active";
  const showDisconnect =
    hasRow && (status === "active" || status === "reauthorization_required" || status === "error");

  return { showConnect, showReauthorize, showRefreshOAuth, showDisconnect };
}

export type BoardYandexDiskIntegrationPanelProps = {
  boardId: string;
  integration: BoardYandexDiskIntegrationSnapshot;
  canManageIntegration: boolean;
  /** Заголовок секции внутри «Поля доски» */
  title?: string;
  className?: string;
  /**
   * Если false — без h3 и вводного абзаца (когда заголовок уже на кнопке-раскрытии).
   */
  showIntroHeading?: boolean;
};

/**
 * Состояние интеграции и действия владельца — точка входа через каталог полей (YDB7.3).
 */
export function BoardYandexDiskIntegrationPanel({
  boardId,
  integration,
  canManageIntegration,
  title = "Яндекс.Диск для этой доски",
  className,
  showIntroHeading = true
}: BoardYandexDiskIntegrationPanelProps) {
  const router = useRouter();
  const [disconnectError, setDisconnectError] = React.useState<string | null>(null);
  const [isDisconnectPending, setIsDisconnectPending] = React.useState(false);

  const oauthHref = yandexDiskOAuthStartPath(boardId);
  const stateUi = getYandexDiskIntegrationModalPresentation(integration, {
    forIntegrationManager: canManageIntegration
  });
  const ownerSafeLastError = safeYandexDiskIntegrationLastErrorTextForOwner(integration?.last_error_text);
  const ownerLastAuthorizedLabel = formatYandexDiskLastAuthorizedAtRu(integration?.last_authorized_at);
  const ownerActions = ownerIntegrationActionFlags(integration);

  const runDisconnect = () => {
    setDisconnectError(null);
    setIsDisconnectPending(true);
    void disconnectBoardYandexDiskIntegrationAction(boardId)
      .then((result) => {
        if (!result.ok) {
          setDisconnectError(result.message);
          return;
        }
        router.refresh();
      })
      .finally(() => setIsDisconnectPending(false));
  };

  return (
    <section
      className={cn(
        "shrink-0 rounded-lg border border-app-divider bg-app-surface-muted p-3",
        className
      )}
      aria-label={showIntroHeading ? undefined : "Настройки интеграции Яндекс.Диска для доски"}
      aria-labelledby={showIntroHeading ? "board-yandex-disk-integration-heading" : undefined}
    >
      {showIntroHeading ?
        <>
          <h3
            id="board-yandex-disk-integration-heading"
            className="text-sm font-medium text-app-primary"
          >
            {title}
          </h3>
          <p className="mt-1 text-xs text-app-secondary">
            Одна интеграция на доску: все поля типа «Яндекс диск» используют эту папку.{" "}
            {YANDEX_DISK_UI_OWNER_ONLY_INTEGRATION_MANAGEMENT}
          </p>
        </>
      : null}

      <div className={cn(showIntroHeading ? "mt-3" : "mt-0", stateUi.panelClassName)}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-app-primary">Состояние</p>
          <span className={stateUi.badgeClassName}>{stateUi.title}</span>
        </div>
        <p className="mt-1 text-sm text-app-primary" role="status">
          {stateUi.publicDescription}
        </p>
        {canManageIntegration && integration?.yandex_login ?
          <p className="mt-1 text-xs text-app-secondary">Аккаунт: {integration.yandex_login}</p>
        : null}
        {integration?.root_folder_path && canManageIntegration ?
          <p className="mt-1 break-all text-xs text-app-secondary">
            Папка: {integration.root_folder_path}
          </p>
        : null}
        {ownerLastAuthorizedLabel && canManageIntegration ?
          <p className="mt-1 text-xs text-app-secondary">
            Последняя успешная авторизация: {ownerLastAuthorizedLabel}
          </p>
        : null}
        {ownerSafeLastError && canManageIntegration ?
          <p className="mt-1 text-xs text-app-validation-error" role="status">
            {ownerSafeLastError}
          </p>
        : null}
      </div>

      {canManageIntegration ?
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {ownerActions.showConnect ?
              <a href={oauthHref} className={oauthLinkPrimaryClass}>
                Подключить
              </a>
            : null}
            {ownerActions.showReauthorize ?
              <a href={oauthHref} className={oauthLinkPrimaryClass}>
                Повторить авторизацию
              </a>
            : null}
            {ownerActions.showRefreshOAuth ?
              <a href={oauthHref} className={oauthLinkSecondaryClass}>
                Обновить доступ в Яндексе
              </a>
            : null}
            {ownerActions.showDisconnect ?
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isDisconnectPending}
                onClick={runDisconnect}
              >
                {isDisconnectPending ? "Отключаем…" : "Отключить"}
              </Button>
            : null}
          </div>
          {disconnectError ?
            <p className="text-xs text-app-validation-error" role="alert">
              {disconnectError}
            </p>
          : null}
        </div>
      : (
        <p className="mt-3 text-xs text-app-secondary">{YANDEX_DISK_UI_OWNER_ONLY_INTEGRATION_MANAGEMENT}</p>
      )}
    </section>
  );
}
