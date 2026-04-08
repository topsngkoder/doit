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
  backgroundType: "color" | "image";
  backgroundColor: string | null;
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
  backgroundType,
  backgroundColor
}: BoardSettingsMenuProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const hasAnySettings =
    canManageBoardLabels || canManageCardFields || canManageCardPreview || canChangeBoardBackground;

  if (!hasAnySettings) {
    return null;
  }

  const itemRevealClass = (): string =>
    `transition-all duration-200 ease-out ${menuOpen ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0 pointer-events-none"}`;

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setMenuOpen(true)}
      onMouseLeave={() => setMenuOpen(false)}
    >
      <button
        type="button"
        className="inline-flex h-8 w-full items-center justify-center rounded-md border border-slate-600 bg-slate-900/60 px-3 text-xs font-medium text-slate-50 transition-colors hover:border-slate-400"
        onFocus={() => setMenuOpen(true)}
      >
        Настройки доски
      </button>

      <div
        className={`absolute left-0 top-full z-20 w-max min-w-full pt-1 transition-opacity duration-150 ${menuOpen ? "visible opacity-100 pointer-events-auto" : "invisible opacity-0 pointer-events-none"}`}
      >
        <div className="flex flex-col gap-1 rounded-xl border border-slate-700/80 bg-slate-950/95 p-1.5 shadow-xl shadow-black/40 backdrop-blur-sm">
          <div className={itemRevealClass()} style={{ transitionDelay: menuOpen ? "0ms" : "0ms" }}>
            <BoardLabelsButton
              boardId={boardId}
              canManage={canManageBoardLabels}
              labels={boardLabels}
              triggerVariant="ghost"
              triggerClassName="w-full justify-start whitespace-nowrap cursor-pointer hover:bg-slate-800/90"
              onTriggerClick={() => setMenuOpen(false)}
            />
          </div>
          <div className={itemRevealClass()} style={{ transitionDelay: menuOpen ? "45ms" : "0ms" }}>
            <BoardFieldsButton
              boardId={boardId}
              canManage={canManageCardFields}
              fieldDefinitions={fieldDefinitions}
              triggerVariant="ghost"
              triggerClassName="w-full justify-start whitespace-nowrap cursor-pointer hover:bg-slate-800/90"
              onTriggerClick={() => setMenuOpen(false)}
            />
          </div>
          <div className={itemRevealClass()} style={{ transitionDelay: menuOpen ? "90ms" : "0ms" }}>
            <BoardCardPreviewButton
              boardId={boardId}
              canManage={canManageCardPreview}
              previewItems={previewItems}
              fieldDefinitions={fieldDefinitions}
              triggerVariant="ghost"
              triggerClassName="w-full justify-start whitespace-nowrap cursor-pointer hover:bg-slate-800/90"
              onTriggerClick={() => setMenuOpen(false)}
            />
          </div>
          <div className={itemRevealClass()} style={{ transitionDelay: menuOpen ? "135ms" : "0ms" }}>
            <BoardBackgroundButton
              boardId={boardId}
              canManage={canChangeBoardBackground}
              currentType={backgroundType}
              currentColor={backgroundColor}
              triggerVariant="ghost"
              triggerClassName="w-full justify-start whitespace-nowrap cursor-pointer hover:bg-slate-800/90"
              onTriggerClick={() => setMenuOpen(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
