import { AddBoardColumnButton } from "./add-board-column-button";
import { BoardColumnsDnD } from "./board-columns-dnd";
import type { NewCardFieldDefinition, NewCardMemberOption } from "./create-card-modal";
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
  cardsByColumnId
}: BoardCanvasProps) {
  return (
    <BoardBackgroundFrame
      backgroundType={board.backgroundType}
      backgroundImagePath={board.backgroundImagePath}
      className="flex h-full min-h-[320px] flex-1 flex-col gap-4 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <AddBoardColumnButton boardId={boardId} canCreate={columnPermissions.canCreate} />
      </div>
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
        cardsByColumnId={cardsByColumnId}
      />
    </BoardBackgroundFrame>
  );
}
