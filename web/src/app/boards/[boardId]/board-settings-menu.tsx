"use client";

import * as React from "react";
import { BoardLabelsButton } from "./board-labels-button";
import { BoardFieldsButton } from "./board-fields-button";
import { BoardCardPreviewButton } from "./board-card-preview-button";
import { BoardBackgroundButton } from "./board-background-button";
import type { BoardLabelOption, BoardCardPreviewItem } from "./column-types";
import type { NewCardFieldDefinition } from "./card-field-drafts";

type BoardSettingsMenuProps = {
  boardId: string;
  canManageBoardLabels: boolean;
  canManageCardFields: boolean;
  canManageCardPreview: boolean;
  canChangeBoardBackground: boolean;
  boardLabels: BoardLabelOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  previewItems: BoardCardPreviewItem[];
  hasBackgroundImage: boolean;
};

export function BoardSettingsMenu({
  boardId,
  canManageBoardLabels,
  canManageCardFields,
  canManageCardPreview,
  canChangeBoardBackground,
  boardLabels,
  fieldDefinitions,
  previewItems,
  hasBackgroundImage
}: BoardSettingsMenuProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRootRef = React.useRef<HTMLDivElement>(null);
  const suppressOpenUntilRef = React.useRef(0);
  const hasAnySettings =
    canManageBoardLabels || canManageCardFields || canManageCardPreview || canChangeBoardBackground;

  const clearCloseTimer = React.useCallback(() => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const openMenu = React.useCallback(() => {
    if (Date.now() < suppressOpenUntilRef.current) return;
    clearCloseTimer();
    setMenuOpen(true);
  }, [clearCloseTimer]);

  const closeMenuWithDelay = React.useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setMenuOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [clearCloseTimer]);

  const closeMenuFromAction = React.useCallback(() => {
    // После клика по пункту не даем hover/focus мгновенно переоткрыть меню.
    suppressOpenUntilRef.current = Date.now() + 250;
    clearCloseTimer();
    setMenuOpen(false);
  }, [clearCloseTimer]);

  React.useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRootRef.current && !menuRootRef.current.contains(target)) {
        clearCloseTimer();
        suppressOpenUntilRef.current = Date.now() + 150;
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDownOutside);
    document.addEventListener("touchstart", handlePointerDownOutside);
    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside);
      document.removeEventListener("touchstart", handlePointerDownOutside);
    };
  }, [menuOpen, clearCloseTimer]);

  if (!hasAnySettings) {
    return null;
  }

  const itemRevealClass = (): string =>
    `transition-all duration-200 ease-out ${menuOpen ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0 pointer-events-none"}`;

  return (
    <div
      ref={menuRootRef}
      className="relative inline-block"
      onMouseEnter={openMenu}
      onMouseLeave={closeMenuWithDelay}
    >
      <button
        type="button"
        className="focus-ring-app inline-flex h-8 w-full items-center justify-center rounded-md border border-app-strong bg-app-surface-muted px-3 text-xs font-medium text-app-primary transition-colors hover:border-app-accent hover:bg-app-surface-subtle"
        onFocus={openMenu}
      >
        Настройки доски
      </button>

      <div
        className={`absolute left-0 top-full z-20 w-max min-w-full pt-1 transition-opacity duration-150 ${menuOpen ? "visible opacity-100 pointer-events-auto" : "invisible opacity-0 pointer-events-none"}`}
        onMouseEnter={openMenu}
        onMouseLeave={closeMenuWithDelay}
      >
        <div className="popup-panel flex flex-col gap-1 p-1.5 shadow-[var(--shadow-card)] backdrop-blur-sm">
          <div className={itemRevealClass()} style={{ transitionDelay: menuOpen ? "0ms" : "0ms" }}>
            <BoardLabelsButton
              boardId={boardId}
              canManage={canManageBoardLabels}
              labels={boardLabels}
              triggerVariant="ghost"
              triggerClassName="w-full justify-start whitespace-nowrap cursor-pointer hover:bg-app-surface-muted"
              onTriggerClick={closeMenuFromAction}
            />
          </div>
          <div className={itemRevealClass()} style={{ transitionDelay: menuOpen ? "45ms" : "0ms" }}>
            <BoardFieldsButton
              boardId={boardId}
              canManage={canManageCardFields}
              fieldDefinitions={fieldDefinitions}
              triggerVariant="ghost"
              triggerClassName="w-full justify-start whitespace-nowrap cursor-pointer hover:bg-app-surface-muted"
              onTriggerClick={closeMenuFromAction}
            />
          </div>
          <div className={itemRevealClass()} style={{ transitionDelay: menuOpen ? "90ms" : "0ms" }}>
            <BoardCardPreviewButton
              boardId={boardId}
              canManage={canManageCardPreview}
              previewItems={previewItems}
              fieldDefinitions={fieldDefinitions}
              triggerVariant="ghost"
              triggerClassName="w-full justify-start whitespace-nowrap cursor-pointer hover:bg-app-surface-muted"
              onTriggerClick={closeMenuFromAction}
            />
          </div>
          <div className={itemRevealClass()} style={{ transitionDelay: menuOpen ? "135ms" : "0ms" }}>
            <BoardBackgroundButton
              boardId={boardId}
              canManage={canChangeBoardBackground}
              hasBackgroundImage={hasBackgroundImage}
              triggerVariant="ghost"
              triggerClassName="w-full justify-start whitespace-nowrap cursor-pointer hover:bg-app-surface-muted"
              onTriggerClick={closeMenuFromAction}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
