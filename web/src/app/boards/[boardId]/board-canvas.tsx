import type { CSSProperties } from "react";
import { AddBoardColumnButton } from "./add-board-column-button";
import { BoardColumnsDnD } from "./board-columns-dnd";
import type { NewCardFieldDefinition, NewCardMemberOption } from "./create-card-modal";
import type {
  BoardCardListItem,
  BoardColumnPermissions,
  CardContentPermissions
} from "./column-types";

export type { BoardColumnPermissions, BoardCardListItem, CardContentPermissions };

type BoardCanvasProps = {
  boardId: string;
  currentUserId: string;
  canCreateCard: boolean;
  membersForNewCard: NewCardMemberOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  columnPermissions: BoardColumnPermissions;
  canMoveCards: boolean;
  canCreateComment: boolean;
  cardContentPermissions: CardContentPermissions;
  board: {
    backgroundType: "color" | "image";
    backgroundColor: string | null;
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
  fieldDefinitions,
  columnPermissions,
  canMoveCards,
  canCreateComment,
  cardContentPermissions,
  board,
  columns,
  cardsByColumnId
}: BoardCanvasProps) {
  const backdropClass =
    board.backgroundType === "color" && board.backgroundColor
      ? ""
      : "bg-slate-900/40";

  const backdropStyle: CSSProperties =
    board.backgroundType === "color" && board.backgroundColor
      ? { backgroundColor: board.backgroundColor }
      : {};

  return (
    <section
      className={`flex min-h-[320px] flex-col gap-4 rounded-xl border border-slate-800/80 p-4 ${backdropClass}`}
      style={backdropStyle}
    >
      {board.backgroundType === "image" && board.backgroundImagePath && (
        <p className="text-xs text-slate-500">
          Фон-картинка задан, отображение через Storage будет в H4 (
          <code className="text-slate-400">{board.backgroundImagePath}</code>).
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <AddBoardColumnButton boardId={boardId} canCreate={columnPermissions.canCreate} />
      </div>
      <BoardColumnsDnD
        boardId={boardId}
        currentUserId={currentUserId}
        canCreateCard={canCreateCard}
        membersForNewCard={membersForNewCard}
        fieldDefinitions={fieldDefinitions}
        columnPermissions={columnPermissions}
        canMoveCards={canMoveCards}
        canCreateComment={canCreateComment}
        cardContentPermissions={cardContentPermissions}
        columns={columns}
        cardsByColumnId={cardsByColumnId}
      />
    </section>
  );
}
