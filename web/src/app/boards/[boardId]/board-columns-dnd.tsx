"use client";

import type { CSSProperties } from "react";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BoardColumnHeader } from "./board-column-header";
import {
  CreateCardButton,
  type NewCardFieldDefinition,
  type NewCardMemberOption
} from "./create-card-modal";
import { reorderBoardColumnsAction } from "./actions";
import type { BoardColumnPermissions } from "./column-types";

type ColumnRow = {
  id: string;
  name: string;
  columnType: string;
  position: number;
};

type BoardColumnsDnDProps = {
  boardId: string;
  currentUserId: string;
  canCreateCard: boolean;
  membersForNewCard: NewCardMemberOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  columnPermissions: BoardColumnPermissions;
  columns: ColumnRow[];
  cardsByColumnId: Map<string, Array<{ id: string; title: string; position: number }>>;
};

function SortableColumn({
  boardId,
  currentUserId,
  canCreateCard,
  membersForNewCard,
  fieldDefinitions,
  col,
  index,
  columnCount,
  columnPermissions,
  cards
}: {
  boardId: string;
  currentUserId: string;
  canCreateCard: boolean;
  membersForNewCard: NewCardMemberOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  col: ColumnRow;
  index: number;
  columnCount: number;
  columnPermissions: BoardColumnPermissions;
  cards: Array<{ id: string; title: string; position: number }>;
}) {
  const enabled = columnPermissions.canReorder;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: col.id, disabled: !enabled });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
    zIndex: isDragging ? 20 : undefined
  };

  const columnDrag =
    enabled ?
      { setActivatorNodeRef, attributes, listeners }
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex w-64 shrink-0 flex-col gap-3 rounded-lg bg-slate-950/70 p-3 ring-1 ring-slate-800"
    >
      <BoardColumnHeader
        boardId={boardId}
        columnId={col.id}
        name={col.name}
        columnType={col.columnType}
        cardCount={cards.length}
        columnIndex={index}
        columnCount={columnCount}
        canRename={columnPermissions.canRename}
        canReorder={columnPermissions.canReorder}
        canDelete={columnPermissions.canDelete}
        columnDrag={columnDrag}
      />
      <ul className="flex flex-col gap-2">
        {cards.map((card) => (
          <li
            key={card.id}
            className="rounded-md border border-slate-800 bg-slate-900/90 px-3 py-2 text-sm text-slate-200 shadow-sm"
          >
            <span className="line-clamp-2">{card.title}</span>
          </li>
        ))}
        {cards.length === 0 ? (
          <li className="rounded-md border border-dashed border-slate-800/80 px-3 py-6 text-center text-xs text-slate-500">
            Пока нет карточек
          </li>
        ) : null}
      </ul>
      <CreateCardButton
        boardId={boardId}
        columnId={col.id}
        canCreate={canCreateCard}
        members={membersForNewCard}
        fieldDefinitions={fieldDefinitions}
        currentUserId={currentUserId}
      />
    </div>
  );
}

function columnsSignature(cols: ColumnRow[]): string {
  return cols
    .map((c) => `${c.id}:${c.position}:${c.name}:${c.columnType}`)
    .join("|");
}

export function BoardColumnsDnD({
  boardId,
  currentUserId,
  canCreateCard,
  membersForNewCard,
  fieldDefinitions,
  columnPermissions,
  columns,
  cardsByColumnId
}: BoardColumnsDnDProps) {
  const router = useRouter();
  const [items, setItems] = React.useState<ColumnRow[]>(columns);
  const [persistError, setPersistError] = React.useState<string | null>(null);

  const sig = columnsSignature(columns);
  React.useEffect(() => {
    setItems(columns);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- синхронизация только при смене доски/порядка с сервера (`sig`).
  }, [boardId, sig]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  if (!columnPermissions.canReorder) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {columns.map((col, index) => {
          const cards = cardsByColumnId.get(col.id) ?? [];
          return (
            <div
              key={col.id}
              className="flex w-64 shrink-0 flex-col gap-3 rounded-lg bg-slate-950/70 p-3 ring-1 ring-slate-800"
            >
              <BoardColumnHeader
                boardId={boardId}
                columnId={col.id}
                name={col.name}
                columnType={col.columnType}
                cardCount={cards.length}
                columnIndex={index}
                columnCount={columns.length}
                canRename={columnPermissions.canRename}
                canReorder={columnPermissions.canReorder}
                canDelete={columnPermissions.canDelete}
                columnDrag={null}
              />
              <ul className="flex flex-col gap-2">
                {cards.map((card) => (
                  <li
                    key={card.id}
                    className="rounded-md border border-slate-800 bg-slate-900/90 px-3 py-2 text-sm text-slate-200 shadow-sm"
                  >
                    <span className="line-clamp-2">{card.title}</span>
                  </li>
                ))}
                {cards.length === 0 ? (
                  <li className="rounded-md border border-dashed border-slate-800/80 px-3 py-6 text-center text-xs text-slate-500">
                    Пока нет карточек
                  </li>
                ) : null}
              </ul>
              <CreateCardButton
                boardId={boardId}
                columnId={col.id}
                canCreate={canCreateCard}
                members={membersForNewCard}
                fieldDefinitions={fieldDefinitions}
                currentUserId={currentUserId}
              />
            </div>
          );
        })}
      </div>
    );
  }

  const onDragEnd = async (event: DragEndEvent) => {
    setPersistError(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((c) => c.id === active.id);
    const newIndex = items.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);

    const res = await reorderBoardColumnsAction(
      boardId,
      next.map((c) => c.id)
    );

    if (!res.ok) {
      setItems(previous);
      setPersistError(res.message);
      return;
    }

    router.refresh();
  };

  return (
    <div className="space-y-1">
      {persistError ? (
        <p className="text-xs text-rose-400" role="alert">
          {persistError}
        </p>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={items.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {items.map((col, index) => (
              <SortableColumn
                key={col.id}
                boardId={boardId}
                currentUserId={currentUserId}
                canCreateCard={canCreateCard}
                membersForNewCard={membersForNewCard}
                fieldDefinitions={fieldDefinitions}
                col={col}
                index={index}
                columnCount={items.length}
                columnPermissions={columnPermissions}
                cards={cardsByColumnId.get(col.id) ?? []}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
