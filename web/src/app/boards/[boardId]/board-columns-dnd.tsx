"use client";

import type { CSSProperties } from "react";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { BoardColumnHeader } from "./board-column-header";
import {
  CreateCardButton,
  type NewCardFieldDefinition,
  type NewCardMemberOption
} from "./create-card-modal";
import { EditCardModal } from "./edit-card-modal";
import { reorderBoardCardsAction, reorderBoardColumnsAction } from "./actions";
import {
  type BoardCardListItem,
  type BoardColumnPermissions,
  type CardContentPermissions,
  canDeleteCard,
  canEditCardContent
} from "./column-types";

const COLUMN_DND_PREFIX = "column:";

function columnDndId(columnId: string) {
  return `${COLUMN_DND_PREFIX}${columnId}`;
}

function isColumnDndId(id: UniqueIdentifier) {
  return String(id).startsWith(COLUMN_DND_PREFIX);
}

function parseColumnDndId(id: UniqueIdentifier) {
  return String(id).slice(COLUMN_DND_PREFIX.length);
}

type ColumnRow = {
  id: string;
  name: string;
  columnType: string;
  position: number;
};

function cardOrderSignature(map: Map<string, BoardCardListItem[]>): string {
  const keys = [...map.keys()].sort((a, b) => a.localeCompare(b));
  return keys
    .map((k) => {
      const list = map.get(k) ?? [];
      return `${k}=${list.map((c) => c.id).join(",")}`;
    })
    .join("|");
}

function buildCardOrderRecord(map: Map<string, BoardCardListItem[]>): Record<string, string[]> {
  const o: Record<string, string[]> = {};
  for (const [colId, cards] of map) {
    o[colId] = cards.map((c) => c.id);
  }
  return o;
}

function findColumnForCard(cardOrder: Record<string, string[]>, cardId: string): string | null {
  for (const [colId, ids] of Object.entries(cardOrder)) {
    if (ids.includes(cardId)) return colId;
  }
  return null;
}

function resolveCardDropTarget(
  overId: UniqueIdentifier,
  cardOrder: Record<string, string[]>
): { columnId: string; index: number } | null {
  const oid = String(overId);
  if (oid.startsWith("empty-")) {
    const colId = oid.slice("empty-".length);
    const list = cardOrder[colId];
    if (!list) return null;
    return { columnId: colId, index: list.length };
  }
  if (isColumnDndId(overId)) {
    const colId = parseColumnDndId(overId);
    const list = cardOrder[colId];
    if (!list) return null;
    return { columnId: colId, index: list.length };
  }
  for (const [colId, ids] of Object.entries(cardOrder)) {
    const idx = ids.indexOf(oid);
    if (idx >= 0) return { columnId: colId, index: idx };
  }
  return null;
}

function applyCardReorder(
  order: Record<string, string[]>,
  activeId: string,
  fromCol: string,
  target: { columnId: string; index: number }
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const k of Object.keys(order)) {
    next[k] = [...order[k]];
  }

  const fromArr = next[fromCol];
  const posInFrom = fromArr.indexOf(activeId);
  if (posInFrom < 0) return order;

  if (fromCol === target.columnId) {
    next[fromCol] = arrayMove(fromArr, posInFrom, target.index);
    return next;
  }

  next[fromCol] = fromArr.filter((id) => id !== activeId);
  const toArr = next[target.columnId];
  const insertAt = Math.min(target.index, toArr.length);
  toArr.splice(insertAt, 0, activeId);
  next[target.columnId] = toArr;
  return next;
}

function EmptyColumnDrop({ columnId, emphasized }: { columnId: string; emphasized: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `empty-${columnId}`,
    data: { type: "empty-column" as const, columnId }
  });
  return (
    <div
      ref={setNodeRef}
      className={
        emphasized ? "min-h-12 rounded-md border border-dashed border-slate-700/80 py-3"
        : "min-h-2 shrink-0"
      }
      style={
        isOver ? { boxShadow: "inset 0 0 0 1px rgb(96 165 250 / 0.35)" } : undefined
      }
    />
  );
}

function BoardCardRow({
  card,
  currentUserId,
  cardContentPermissions,
  onOpen,
  dragHandleProps
}: {
  card: BoardCardListItem;
  currentUserId: string;
  cardContentPermissions: CardContentPermissions;
  onOpen: (card: BoardCardListItem) => void;
  dragHandleProps?: Pick<
    ReturnType<typeof useSortable>,
    "attributes" | "listeners"
  >;
}) {
  const canOpen =
    canEditCardContent(cardContentPermissions, card.createdByUserId, currentUserId) ||
    canDeleteCard(cardContentPermissions, card.createdByUserId, currentUserId);

  return (
    <div
      role={canOpen ? "button" : undefined}
      className={
        canOpen ?
          "flex cursor-pointer gap-2 rounded-md border border-slate-800 bg-slate-900/90 px-3 py-2 text-sm text-slate-200 shadow-sm transition-colors hover:border-slate-600 hover:bg-slate-900"
        : "flex gap-2 rounded-md border border-slate-800 bg-slate-900/90 px-3 py-2 text-sm text-slate-200 shadow-sm"
      }
      onClick={canOpen ? () => onOpen(card) : undefined}
      onKeyDown={
        canOpen ?
          (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(card);
            }
          }
        : undefined
      }
      tabIndex={canOpen ? 0 : undefined}
    >
      {dragHandleProps ?
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab text-slate-500 hover:text-slate-300 active:cursor-grabbing"
          aria-label="Перетащить карточку"
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
          onClick={(e) => e.stopPropagation()}
        >
          ⋮⋮
        </button>
      : null}
      <span className="line-clamp-2 min-w-0 flex-1">{card.title}</span>
    </div>
  );
}

function SortableBoardCard({
  card,
  currentUserId,
  cardContentPermissions,
  onOpen,
  enableDrag
}: {
  card: BoardCardListItem;
  currentUserId: string;
  cardContentPermissions: CardContentPermissions;
  onOpen: (card: BoardCardListItem) => void;
  enableDrag: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !enableDrag
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.82 : 1,
    zIndex: isDragging ? 20 : undefined
  };

  return (
    <div ref={setNodeRef} style={style} role="listitem">
      <BoardCardRow
        card={card}
        currentUserId={currentUserId}
        cardContentPermissions={cardContentPermissions}
        onOpen={onOpen}
        dragHandleProps={enableDrag ? { attributes, listeners } : undefined}
      />
    </div>
  );
}

type BoardColumnsDnDProps = {
  boardId: string;
  currentUserId: string;
  canCreateCard: boolean;
  canMoveCards: boolean;
  canCreateComment: boolean;
  membersForNewCard: NewCardMemberOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  columnPermissions: BoardColumnPermissions;
  cardContentPermissions: CardContentPermissions;
  columns: ColumnRow[];
  cardsByColumnId: Map<string, BoardCardListItem[]>;
};

function SortableColumnShell({
  boardId,
  currentUserId,
  canCreateCard,
  canMoveCards,
  membersForNewCard,
  fieldDefinitions,
  col,
  index,
  columnCount,
  columnPermissions,
  cardContentPermissions,
  cardIds,
  cardsById,
  columnSortableEnabled,
  onOpenCard
}: {
  boardId: string;
  currentUserId: string;
  canCreateCard: boolean;
  canMoveCards: boolean;
  membersForNewCard: NewCardMemberOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  col: ColumnRow;
  index: number;
  columnCount: number;
  columnPermissions: BoardColumnPermissions;
  cardContentPermissions: CardContentPermissions;
  cardIds: string[];
  cardsById: Map<string, BoardCardListItem>;
  columnSortableEnabled: boolean;
  onOpenCard: (card: BoardCardListItem) => void;
}) {
  const colDragId = columnDndId(col.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: colDragId,
    disabled: !columnSortableEnabled
  });

  const columnStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
    zIndex: isDragging ? 25 : undefined
  };

  const columnDrag =
    columnSortableEnabled ?
      { setActivatorNodeRef, attributes, listeners }
    : null;

  const cards = cardIds.map((id) => cardsById.get(id)).filter(Boolean) as BoardCardListItem[];

  return (
    <div
      ref={setNodeRef}
      style={columnStyle}
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
        canReorder={columnSortableEnabled}
        canDelete={columnPermissions.canDelete}
        columnDrag={columnDrag}
      />
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-0 flex-col gap-2" role="list">
          {cards.map((card) => (
            <SortableBoardCard
              key={card.id}
              card={card}
              currentUserId={currentUserId}
              cardContentPermissions={cardContentPermissions}
              onOpen={onOpenCard}
              enableDrag={canMoveCards}
            />
          ))}
          {cards.length === 0 ?
            <div className="rounded-md border border-dashed border-slate-800/80 px-3 py-6 text-center text-xs text-slate-500">
              Пока нет карточек
            </div>
          : null}
        </div>
        {canMoveCards ?
          <EmptyColumnDrop columnId={col.id} emphasized={cards.length === 0} />
        : null}
      </SortableContext>
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

function StaticColumnShell({
  boardId,
  currentUserId,
  canCreateCard,
  canMoveCards,
  membersForNewCard,
  fieldDefinitions,
  col,
  index,
  columnCount,
  columnPermissions,
  cardContentPermissions,
  cardIds,
  cardsById,
  onOpenCard
}: {
  boardId: string;
  currentUserId: string;
  canCreateCard: boolean;
  canMoveCards: boolean;
  membersForNewCard: NewCardMemberOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  col: ColumnRow;
  index: number;
  columnCount: number;
  columnPermissions: BoardColumnPermissions;
  cardContentPermissions: CardContentPermissions;
  cardIds: string[];
  cardsById: Map<string, BoardCardListItem>;
  onOpenCard: (card: BoardCardListItem) => void;
}) {
  const cards = cardIds.map((id) => cardsById.get(id)).filter(Boolean) as BoardCardListItem[];

  return (
    <div className="flex w-64 shrink-0 flex-col gap-3 rounded-lg bg-slate-950/70 p-3 ring-1 ring-slate-800">
      <BoardColumnHeader
        boardId={boardId}
        columnId={col.id}
        name={col.name}
        columnType={col.columnType}
        cardCount={cards.length}
        columnIndex={index}
        columnCount={columnCount}
        canRename={columnPermissions.canRename}
        canReorder={false}
        canDelete={columnPermissions.canDelete}
        columnDrag={null}
      />
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-0 flex-col gap-2" role="list">
          {cards.map((card) => (
            <SortableBoardCard
              key={card.id}
              card={card}
              currentUserId={currentUserId}
              cardContentPermissions={cardContentPermissions}
              onOpen={onOpenCard}
              enableDrag={canMoveCards}
            />
          ))}
          {cards.length === 0 ?
            <div className="rounded-md border border-dashed border-slate-800/80 px-3 py-6 text-center text-xs text-slate-500">
              Пока нет карточек
            </div>
          : null}
        </div>
        {canMoveCards ?
          <EmptyColumnDrop columnId={col.id} emphasized={cards.length === 0} />
        : null}
      </SortableContext>
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

/** Без @dnd-kit — нужен для первого SSR-прохода (иначе aria-describedby DnD… расходится при гидратации). */
function BoardGridStatic({
  boardId,
  currentUserId,
  canCreateCard,
  membersForNewCard,
  fieldDefinitions,
  columnPermissions,
  cardContentPermissions,
  columnRows,
  cardOrderByColumn,
  cardsById,
  onOpenCard
}: {
  boardId: string;
  currentUserId: string;
  canCreateCard: boolean;
  membersForNewCard: NewCardMemberOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  columnPermissions: BoardColumnPermissions;
  cardContentPermissions: CardContentPermissions;
  columnRows: ColumnRow[];
  cardOrderByColumn: Record<string, string[]>;
  cardsById: Map<string, BoardCardListItem>;
  onOpenCard: (card: BoardCardListItem) => void;
}) {
  const columnCount = columnRows.length;
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columnRows.map((col, index) => (
        <div
          key={col.id}
          className="flex w-64 shrink-0 flex-col gap-3 rounded-lg bg-slate-950/70 p-3 ring-1 ring-slate-800"
        >
          <BoardColumnHeader
            boardId={boardId}
            columnId={col.id}
            name={col.name}
            columnType={col.columnType}
            cardCount={(cardOrderByColumn[col.id] ?? []).length}
            columnIndex={index}
            columnCount={columnCount}
            canRename={columnPermissions.canRename}
            canReorder={false}
            canDelete={columnPermissions.canDelete}
            columnDrag={null}
          />
          <div className="flex flex-col gap-2" role="list">
            {(cardOrderByColumn[col.id] ?? [])
              .map((id) => cardsById.get(id))
              .filter(Boolean)
              .map((card) => (
                <div key={card!.id} role="listitem">
                  <BoardCardRow
                    card={card!}
                    currentUserId={currentUserId}
                    cardContentPermissions={cardContentPermissions}
                    onOpen={onOpenCard}
                  />
                </div>
              ))}
            {(cardOrderByColumn[col.id] ?? []).length === 0 ?
              <div className="rounded-md border border-dashed border-slate-800/80 px-3 py-6 text-center text-xs text-slate-500">
                Пока нет карточек
              </div>
            : null}
          </div>
          <CreateCardButton
            boardId={boardId}
            columnId={col.id}
            canCreate={canCreateCard}
            members={membersForNewCard}
            fieldDefinitions={fieldDefinitions}
            currentUserId={currentUserId}
          />
        </div>
      ))}
    </div>
  );
}

export function BoardColumnsDnD({
  boardId,
  currentUserId,
  canCreateCard,
  canMoveCards,
  canCreateComment,
  membersForNewCard,
  fieldDefinitions,
  columnPermissions,
  cardContentPermissions,
  columns,
  cardsByColumnId
}: BoardColumnsDnDProps) {
  const router = useRouter();
  const [columnItems, setColumnItems] = React.useState<ColumnRow[]>(columns);
  const [cardOrderByColumn, setCardOrderByColumn] = React.useState<Record<string, string[]>>(
    () => buildCardOrderRecord(cardsByColumnId)
  );
  const [persistError, setPersistError] = React.useState<string | null>(null);
  const [editingCard, setEditingCard] = React.useState<BoardCardListItem | null>(null);
  const [dndMounted, setDndMounted] = React.useState(false);

  React.useEffect(() => {
    setDndMounted(true);
  }, []);

  const colSig = columnsSignature(columns);
  React.useEffect(() => {
    setColumnItems(columns);
  }, [boardId, colSig]);

  const cardSig = cardOrderSignature(cardsByColumnId);
  React.useEffect(() => {
    setCardOrderByColumn(buildCardOrderRecord(cardsByColumnId));
  }, [boardId, cardSig]);

  const cardsById = React.useMemo(() => {
    const m = new Map<string, BoardCardListItem>();
    for (const list of cardsByColumnId.values()) {
      for (const c of list) {
        m.set(c.id, c);
      }
    }
    return m;
  }, [cardsByColumnId]);

  React.useEffect(() => {
    let cancelled = false;
    try {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel(`realtime:cards:${boardId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "cards",
            filter: `board_id=eq.${boardId}`
          },
          () => {
            if (!cancelled) router.refresh();
          }
        )
        .subscribe();

      return () => {
        cancelled = true;
        void supabase.removeChannel(channel);
      };
    } catch {
      return () => {};
    }
  }, [boardId, router]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const showColumnDnd = columnPermissions.canReorder;
  const showAnyDnd = showColumnDnd || canMoveCards;

  const handleDragEnd = async (event: DragEndEvent) => {
    setPersistError(null);
    const { active, over } = event;
    if (!over) return;

    if (isColumnDndId(active.id)) {
      if (!showColumnDnd) return;
      if (!isColumnDndId(over.id)) return;

      const activeKey = parseColumnDndId(active.id);
      const overKey = parseColumnDndId(over.id);
      if (activeKey === overKey) return;

      const oldIndex = columnItems.findIndex((c) => c.id === activeKey);
      const newIndex = columnItems.findIndex((c) => c.id === overKey);
      if (oldIndex < 0 || newIndex < 0) return;

      const previousCols = columnItems;
      const nextCols = arrayMove(columnItems, oldIndex, newIndex);
      setColumnItems(nextCols);

      const res = await reorderBoardColumnsAction(
        boardId,
        nextCols.map((c) => c.id)
      );

      if (!res.ok) {
        setColumnItems(previousCols);
        setPersistError(res.message);
        return;
      }

      router.refresh();
      return;
    }

    if (!canMoveCards) return;

    if (String(active.id) === String(over.id)) return;

    const activeCardId = String(active.id);
    const fromCol = findColumnForCard(cardOrderByColumn, activeCardId);
    if (!fromCol) return;

    const target = resolveCardDropTarget(over.id, cardOrderByColumn);
    if (!target) return;

    if (fromCol === target.columnId && cardOrderByColumn[fromCol].indexOf(activeCardId) === target.index) {
      return;
    }

    const previousOrder = cardOrderByColumn;
    const nextOrder = applyCardReorder(cardOrderByColumn, activeCardId, fromCol, target);
    setCardOrderByColumn(nextOrder);

    const layout = columnItems.map((c) => ({
      column_id: c.id,
      card_ids: nextOrder[c.id] ?? []
    }));

    const res = await reorderBoardCardsAction(boardId, layout);
    if (!res.ok) {
      setCardOrderByColumn(previousOrder);
      setPersistError(res.message);
      return;
    }

    router.refresh();
  };

  const editModal = (
    <EditCardModal
      open={editingCard != null}
      boardId={boardId}
      card={editingCard}
      canEditContent={
        editingCard ?
          canEditCardContent(
            cardContentPermissions,
            editingCard.createdByUserId,
            currentUserId
          )
        : false
      }
      canDelete={
        editingCard ?
          canDeleteCard(
            cardContentPermissions,
            editingCard.createdByUserId,
            currentUserId
          )
        : false
      }
      canCreateComment={canCreateComment}
      boardMembers={membersForNewCard}
      onClose={() => setEditingCard(null)}
    />
  );

  if (!showAnyDnd) {
    return (
      <>
        {editModal}
        <BoardGridStatic
          boardId={boardId}
          currentUserId={currentUserId}
          canCreateCard={canCreateCard}
          membersForNewCard={membersForNewCard}
          fieldDefinitions={fieldDefinitions}
          columnPermissions={columnPermissions}
          cardContentPermissions={cardContentPermissions}
          columnRows={columns}
          cardOrderByColumn={cardOrderByColumn}
          cardsById={cardsById}
          onOpenCard={setEditingCard}
        />
      </>
    );
  }

  if (!dndMounted) {
    return (
      <>
        {editModal}
        <BoardGridStatic
          boardId={boardId}
          currentUserId={currentUserId}
          canCreateCard={canCreateCard}
          membersForNewCard={membersForNewCard}
          fieldDefinitions={fieldDefinitions}
          columnPermissions={columnPermissions}
          cardContentPermissions={cardContentPermissions}
          columnRows={columnItems}
          cardOrderByColumn={cardOrderByColumn}
          cardsById={cardsById}
          onOpenCard={setEditingCard}
        />
      </>
    );
  }

  const columnRow =
    showColumnDnd ?
      <SortableContext
        items={columnItems.map((c) => columnDndId(c.id))}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex gap-4 overflow-x-auto pb-2">
          {columnItems.map((col, index) => (
            <SortableColumnShell
              key={col.id}
              boardId={boardId}
              currentUserId={currentUserId}
              canCreateCard={canCreateCard}
              canMoveCards={canMoveCards}
              membersForNewCard={membersForNewCard}
              fieldDefinitions={fieldDefinitions}
              col={col}
              index={index}
              columnCount={columnItems.length}
              columnPermissions={columnPermissions}
              cardContentPermissions={cardContentPermissions}
              cardIds={cardOrderByColumn[col.id] ?? []}
              cardsById={cardsById}
              columnSortableEnabled
              onOpenCard={setEditingCard}
            />
          ))}
        </div>
      </SortableContext>
    : <div className="flex gap-4 overflow-x-auto pb-2">
        {columnItems.map((col, index) => (
          <StaticColumnShell
            key={col.id}
            boardId={boardId}
            currentUserId={currentUserId}
            canCreateCard={canCreateCard}
            canMoveCards={canMoveCards}
            membersForNewCard={membersForNewCard}
            fieldDefinitions={fieldDefinitions}
            col={col}
            index={index}
            columnCount={columnItems.length}
            columnPermissions={columnPermissions}
            cardContentPermissions={cardContentPermissions}
            cardIds={cardOrderByColumn[col.id] ?? []}
            cardsById={cardsById}
            onOpenCard={setEditingCard}
          />
        ))}
      </div>;

  return (
    <div className="space-y-1">
      {editModal}
      {persistError ?
        <p className="text-xs text-rose-400" role="alert">
          {persistError}
        </p>
      : null}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        {columnRow}
      </DndContext>
    </div>
  );
}
