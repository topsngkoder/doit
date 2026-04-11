"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { BoardYandexDiskIntegrationSnapshot } from "@/lib/board-snapshot-types";
import { yandexDiskOAuthStartPath } from "@/lib/yandex-disk/yandex-disk-board-ui-endpoints";

type BoardYandexDiskButtonProps = {
  boardId: string;
  /** Владелец доски или системный администратор — OAuth и будущие действия управления. */
  canManageIntegration: boolean;
  integration: BoardYandexDiskIntegrationSnapshot;
  triggerClassName?: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "destructive";
  onTriggerClick?: () => void;
};

function integrationStatusLabel(integration: BoardYandexDiskIntegrationSnapshot): string {
  if (!integration) return "Не подключено";
  switch (integration.status) {
    case "active":
      return "Подключено";
    case "reauthorization_required":
      return "Требуется повторная авторизация";
    case "disconnected":
      return "Отключено";
    case "error":
      return "Ошибка";
    default:
      return "Неизвестное состояние";
  }
}

export function BoardYandexDiskButton({
  boardId,
  canManageIntegration,
  integration,
  triggerClassName,
  triggerVariant = "secondary",
  onTriggerClick
}: BoardYandexDiskButtonProps) {
  const [open, setOpen] = React.useState(false);
  const oauthHref = yandexDiskOAuthStartPath(boardId);

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size="sm"
        className={triggerClassName}
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

          <div className="space-y-1 rounded-[var(--radius-surface)] border border-app-default bg-app-surface-muted p-3">
            <p className="text-xs font-medium text-app-primary">Состояние</p>
            <p className="text-sm text-app-primary">{integrationStatusLabel(integration)}</p>
            {integration?.yandex_login ?
              <p className="text-xs text-app-secondary">Аккаунт: {integration.yandex_login}</p>
            : null}
            {integration?.root_folder_path && canManageIntegration ?
              <p className="break-all text-xs text-app-secondary">
                Папка: {integration.root_folder_path}
              </p>
            : null}
            {integration?.last_error_text && canManageIntegration ?
              <p className="text-xs text-app-validation-error" role="status">
                {integration.last_error_text}
              </p>
            : null}
          </div>

          {canManageIntegration ?
            <div className="flex flex-wrap gap-2">
              <a
                href={oauthHref}
                className="focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] inline-flex h-8 items-center justify-center rounded-[var(--radius-control)] bg-[var(--accent-bg)] px-3 text-xs font-medium text-[var(--text-on-accent)] shadow-sm transition-colors hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)]"
              >
                Подключить или обновить доступ
              </a>
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
