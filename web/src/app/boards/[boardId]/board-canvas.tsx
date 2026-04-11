"use client";

import * as React from "react";
import { BoardYandexDiskIntegrationProvider } from "./board-yandex-disk-integration-context";
import { BoardColumnsDnD } from "./board-columns-dnd";
import type { NewCardFieldDefinition, NewCardMemberOption } from "./create-card-modal";
import type { BoardYandexDiskIntegrationSnapshot } from "@/lib/board-snapshot-types";
import type {
  BoardCardListItem,
  BoardColumnPermissions,
  BoardLabelOption,
  BoardCardPreviewItem,
  CardContentPermissions
} from "./column-types";
import { BoardBackgroundFrame } from "./board-background-frame";

export type { BoardColumnPermissions, BoardCardListItem, BoardLabelOption, CardContentPermissions };

type BoardCanvasProps = {
  boardId: string;
  currentUserId: string;
  canCreateCard: boolean;
  membersForNewCard: NewCardMemberOption[];
  boardLabels: BoardLabelOption[];
  previewItems: BoardCardPreviewItem[];
  fieldDefinitions: NewCardFieldDefinition[];
  columnPermissions: BoardColumnPermissions;
  canMoveCards: boolean;
  canCreateComment: boolean;
  canEditOwnComment: boolean;
  canDeleteOwnComment: boolean;
  canModerateComments: boolean;
  cardContentPermissions: CardContentPermissions;
  board: {
    backgroundType: "none" | "image";
    backgroundImagePath: string | null;
  };
  columns: Array<{
    id: string;
    name: string;
    columnType: string;
    position: number;
  }>;
  cardsByColumnId: Map<string, BoardCardListItem[]>;
  yandexDiskIntegration: BoardYandexDiskIntegrationSnapshot;
  canManageYandexDiskIntegration: boolean;
};

export function BoardCanvas({
  boardId,
  currentUserId,
  canCreateCard,
  membersForNewCard,
  boardLabels,
  previewItems,
  fieldDefinitions,
  columnPermissions,
  canMoveCards,
  canCreateComment,
  canEditOwnComment,
  canDeleteOwnComment,
  canModerateComments,
  cardContentPermissions,
  board,
  columns,
  cardsByColumnId,
  yandexDiskIntegration,
  canManageYandexDiskIntegration
}: BoardCanvasProps) {
  const columnsStageRef = React.useRef<HTMLDivElement | null>(null);
  const columnsSig = React.useMemo(
    () => columns.map((column) => `${column.id}:${column.position}`).join("|"),
    [columns]
  );

  React.useEffect(() => {
    const stage = columnsStageRef.current;
    if (!stage) return;
    let newColumnId: string | null = null;
    try {
      newColumnId = sessionStorage.getItem(`board:new-column:${boardId}`);
    } catch {
      return;
    }
    if (!newColumnId) return;
    const escapedColumnId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(newColumnId) : newColumnId;
    const target = stage.querySelector<HTMLElement>(`[data-board-column-id="${escapedColumnId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    try {
      sessionStorage.removeItem(`board:new-column:${boardId}`);
    } catch {
      // ignore
    }
  }, [boardId, columnsSig]);

  return (
    <BoardBackgroundFrame
      backgroundType={board.backgroundType}
      backgroundImagePath={board.backgroundImagePath}
      className="flex h-full min-h-[320px] flex-1 flex-col pt-3 md:pt-4"
    >
      <div
        ref={columnsStageRef}
        className="board-columns-scroll min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth"
      >
        <BoardYandexDiskIntegrationProvider
          value={{
            integration: yandexDiskIntegration,
            canManageIntegration: canManageYandexDiskIntegration
          }}
        >
          <BoardColumnsDnD
            boardId={boardId}
            currentUserId={currentUserId}
            canCreateCard={canCreateCard}
            membersForNewCard={membersForNewCard}
            boardLabels={boardLabels}
            previewItems={previewItems}
            fieldDefinitions={fieldDefinitions}
            columnPermissions={columnPermissions}
            canMoveCards={canMoveCards}
            canCreateComment={canCreateComment}
            canEditOwnComment={canEditOwnComment}
            canDeleteOwnComment={canDeleteOwnComment}
            canModerateComments={canModerateComments}
            cardContentPermissions={cardContentPermissions}
            columns={columns}
            visibleColumnIds={columns.map((column) => column.id)}
            cardsByColumnId={cardsByColumnId}
          />
        </BoardYandexDiskIntegrationProvider>
      </div>
    </BoardBackgroundFrame>
  );
}
