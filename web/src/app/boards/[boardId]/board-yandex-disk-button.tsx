"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { BoardYandexDiskIntegrationSnapshot } from "@/lib/board-snapshot-types";
import { yandexDiskOAuthStartPath } from "@/lib/yandex-disk/yandex-disk-board-ui-endpoints";
import {
  getYandexDiskIntegrationModalPresentation,
  safeYandexDiskIntegrationLastErrorTextForOwner
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

type BoardYandexDiskButtonProps = {
  boardId: string;
  /** Владелец доски или системный администратор — OAuth и будущие действия управления. */
  canManageIntegration: boolean;
  integration: BoardYandexDiskIntegrationSnapshot;
  triggerClassName?: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "destructive";
  onTriggerClick?: () => void;
};

function ownerIntegrationActionFlags(integration: BoardYandexDiskIntegrationSnapshot) {
  const hasRow = integration != null;
  const status = integration?.status;

  const showConnect = !hasRow || status === "disconnected";
  const showReauthorize = hasRow && (status === "reauthorization_required" || status === "error");
  const showRefreshOAuth =
    hasRow && status === "active";
  const showDisconnect =
    hasRow &&
    (status === "active" || status === "reauthorization_required" || status === "error");

  return { showConnect, showReauthorize, showRefreshOAuth, showDisconnect };
}

export function BoardYandexDiskButton({
  boardId,
  canManageIntegration,
  integration,
  triggerClassName,
  triggerVariant = "secondary",
  onTriggerClick
}: BoardYandexDiskButtonProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [disconnectError, setDisconnectError] = React.useState<string | null>(null);
  const [isDisconnectPending, setIsDisconnectPending] = React.useState(false);

  const oauthHref = yandexDiskOAuthStartPath(boardId);
  const stateUi = getYandexDiskIntegrationModalPresentation(integration, {
    forIntegrationManager: canManageIntegration
  });
  const ownerSafeLastError = safeYandexDiskIntegrationLastErrorTextForOwner(integration?.last_error_text);

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
        setOpen(false);
        router.refresh();
      })
      .finally(() => setIsDisconnectPending(false));
  };

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size="sm"
        className={triggerClassName}
        title={`Состояние: ${stateUi.title}`}
        aria-label={`Яндекс.Диск, ${stateUi.title}`}
        onClick={() => {
          onTriggerClick?.();
          setOpen(true);
        }}
      >
        Яндекс.Диск
      </Button>
      <Modal open={open} title="Яндекс.Диск" onClose={() => setOpen(false)} className="max-w-md">
        <div className="space-y-4">
          <p className="text-xs text-app-secondary">
            Файлы карточек хранятся в папке доски на Яндекс.Диске. Подключить и отключить интеграцию
            может только владелец доски.
          </p>

          <div className={stateUi.panelClassName}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium text-app-primary">Состояние</p>
              <span className={stateUi.badgeClassName}>{stateUi.title}</span>
            </div>
            <p className="text-sm text-app-primary" role="status">
              {stateUi.publicDescription}
            </p>
            {canManageIntegration && integration?.yandex_login ?
              <p className="text-xs text-app-secondary">Аккаунт: {integration.yandex_login}</p>
            : null}
            {integration?.root_folder_path && canManageIntegration ?
              <p className="break-all text-xs text-app-secondary">
                Папка: {integration.root_folder_path}
              </p>
            : null}
            {ownerSafeLastError && canManageIntegration ?
              <p className="text-xs text-app-validation-error" role="status">
                {ownerSafeLastError}
              </p>
            : null}
          </div>

          {canManageIntegration ?
            <div className="space-y-3">
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
            <p className="text-xs text-app-secondary">
              Управлять подключением может только владелец доски.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
