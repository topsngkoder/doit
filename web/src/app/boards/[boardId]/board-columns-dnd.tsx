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
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
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
  type BoardLabelOption,
  type BoardCardPreviewItem,
  type CardContentPermissions,
  canDeleteCard,
  canEditCardBodyAsAssignee,
  canEditCardContent,
  canOpenCardModal
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

function cardOrderRecordSignature(order: Record<string, string[]>): string {
  const keys = Object.keys(order).sort((a, b) => a.localeCompare(b));
  return keys.map((k) => `${k}=${(order[k] ?? []).join(",")}`).join("|");
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
  boardLabels = [],
  previewItems = [],
  fieldDefinitions = [],
  memberNamesById = new Map<string, string>(),
  memberAvatarsById = new Map<string, string | null>(),
  onOpen,
  dragHandleProps
}: {
  card: BoardCardListItem;
  currentUserId: string;
  cardContentPermissions: CardContentPermissions;
  boardLabels?: BoardLabelOption[];
  previewItems?: BoardCardPreviewItem[];
  fieldDefinitions?: NewCardFieldDefinition[];
  memberNamesById?: Map<string, string>;
  memberAvatarsById?: Map<string, string | null>;
  onOpen: (card: BoardCardListItem) => void;
  dragHandleProps?: Pick<
    ReturnType<typeof useSortable>,
    "attributes" | "listeners"
  >;
}) {
  const canOpen = canOpenCardModal(cardContentPermissions, card, currentUserId);
  const enabledPreviewItems = previewItems
    .filter((i) => i.enabled)
    .sort((a, b) => a.position - b.position);
  const labelsById = new Map(boardLabels.map((l) => [l.id, l]));
  const fieldDefsById = new Map(fieldDefinitions.map((f) => [f.id, f]));
  const labelsPreviewEnabled = enabledPreviewItems.some((item) => item.itemType === "labels");
  const cardLabels = card.labelIds
    .map((id) => labelsById.get(id))
    .filter(Boolean) as BoardLabelOption[];
  const primaryLabel = labelsPreviewEnabled ? (cardLabels[0] ?? null) : null;

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return parts
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("");
  }

  return (
    <div
      role={canOpen ? "button" : undefined}
      className={
        canOpen ?
          "flex cursor-pointer gap-2 rounded-md border border-slate-800 bg-slate-900/90 px-3 py-2 text-sm text-slate-200 shadow-sm transition-colors hover:border-slate-600 hover:bg-slate-900"
        : "flex gap-2 rounded-md border border-slate-800 bg-slate-900/90 px-3 py-2 text-sm text-slate-200 shadow-sm"
      }
      style={
        primaryLabel ?
          {
            borderLeftWidth: 4,
            borderLeftColor: primaryLabel.color
          }
        : undefined
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
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 min-w-0">{card.title}</span>
          {primaryLabel ?
            <span className="shrink-0 truncate text-[11px] text-slate-400">{primaryLabel.name}</span>
          : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {enabledPreviewItems
            .filter((item) => item.itemType !== "title")
            .map((item) => {
              if (item.itemType === "assignees") {
                if (card.assigneeUserIds.length === 0) return null;
                return (
                  <div key={item.id} className="flex items-center -space-x-1">
                    {card.assigneeUserIds.slice(0, 4).map((userId) => {
                      const avatarUrl = memberAvatarsById.get(userId);
                      const displayName = memberNamesById.get(userId) ?? "Участник";
                      return (
                        <span
                          key={userId}
                          className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-slate-800 bg-slate-700 text-[10px] font-medium text-slate-100"
                          title={displayName}
                        >
                          {avatarUrl ?
                            <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                          : initials(displayName)}
                        </span>
                      );
                    })}
                    {card.assigneeUserIds.length > 4 ?
                      <span className="ml-1 text-[11px] text-slate-400">{`+${card.assigneeUserIds.length - 4}`}</span>
                    : null}
                  </div>
                );
              }
              if (item.itemType === "comments_count") {
                return (
                  <span key={item.id} className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px] text-slate-300">
                    {`Комментарии: ${card.commentsCount}`}
                  </span>
                );
              }
              if (item.itemType === "labels") {
                return null;
              }
              if (item.itemType === "responsible") {
                if (!card.responsibleUserId) return null;
                const name = memberNamesById.get(card.responsibleUserId) ?? "Участник";
                return (
                  <span key={item.id} className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px] text-slate-300">
                    {`Отв.: ${name}`}
                  </span>
                );
              }
              if (item.itemType === "custom_field") {
                if (!item.fieldDefinitionId) return null;
                const fieldDef = fieldDefsById.get(item.fieldDefinitionId);
                if (!fieldDef) return null;
                const snapshot = card.fieldValues[item.fieldDefinitionId];
                if (!snapshot) return null;
                let value = "";
                if (fieldDef.fieldType === "text") {
                  value = snapshot.textValue ?? "";
                } else if (fieldDef.fieldType === "date") {
                  value = snapshot.dateValue ?? "";
                } else if (fieldDef.fieldType === "link") {
                  value = snapshot.linkText || snapshot.linkUrl || "";
                } else if (fieldDef.fieldType === "select") {
                  const option = fieldDef.selectOptions.find((o) => o.id === snapshot.selectOptionId);
                  value = option?.name ?? "";
                }
                if (!value) return null;
                return (
                  <span key={item.id} className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px] text-slate-300">
                    {`${fieldDef.name}: ${value}`}
                  </span>
                );
              }
              return null;
            })}
        </div>
      </div>
    </div>
  );
}

function SortableBoardCard({
  card,
  currentUserId,
  cardContentPermissions,
  boardLabels,
  previewItems,
  fieldDefinitions,
  memberNamesById,
  memberAvatarsById,
  onOpen,
  enableDrag
}: {
  card: BoardCardListItem;
  currentUserId: string;
  cardContentPermissions: CardContentPermissions;
  boardLabels: BoardLabelOption[];
  previewItems: BoardCardPreviewItem[];
  fieldDefinitions: NewCardFieldDefinition[];
  memberNamesById: Map<string, string>;
  memberAvatarsById: Map<string, string | null>;
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
        boardLabels={boardLabels}
        previewItems={previewItems}
        fieldDefinitions={fieldDefinitions}
        memberNamesById={memberNamesById}
        memberAvatarsById={memberAvatarsById}
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
  canEditOwnComment: boolean;
  canDeleteOwnComment: boolean;
  canModerateComments: boolean;
  membersForNewCard: NewCardMemberOption[];
  boardLabels: BoardLabelOption[];
  previewItems: BoardCardPreviewItem[];
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
  boardLabels,
  previewItems,
  memberNamesById,
  memberAvatarsById,
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
  boardLabels: BoardLabelOption[];
  previewItems: BoardCardPreviewItem[];
  memberNamesById: Map<string, string>;
  memberAvatarsById: Map<string, string | null>;
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
              boardLabels={boardLabels}
              previewItems={previewItems}
              fieldDefinitions={fieldDefinitions}
              memberNamesById={memberNamesById}
              memberAvatarsById={memberAvatarsById}
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
  boardLabels,
  previewItems,
  memberNamesById,
  memberAvatarsById,
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
  boardLabels: BoardLabelOption[];
  previewItems: BoardCardPreviewItem[];
  memberNamesById: Map<string, string>;
  memberAvatarsById: Map<string, string | null>;
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
              boardLabels={boardLabels}
              previewItems={previewItems}
              fieldDefinitions={fieldDefinitions}
              memberNamesById={memberNamesById}
              memberAvatarsById={memberAvatarsById}
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
  boardLabels,
  previewItems,
  memberNamesById,
  memberAvatarsById,
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
  boardLabels: BoardLabelOption[];
  previewItems: BoardCardPreviewItem[];
  memberNamesById: Map<string, string>;
  memberAvatarsById: Map<string, string | null>;
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
                    boardLabels={boardLabels}
                    previewItems={previewItems}
                    fieldDefinitions={fieldDefinitions}
                    memberNamesById={memberNamesById}
                    memberAvatarsById={memberAvatarsById}
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
  canEditOwnComment,
  canDeleteOwnComment,
  canModerateComments,
  membersForNewCard,
  boardLabels,
  previewItems,
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
  const [editingCardId, setEditingCardId] = React.useState<string | null>(null);
  const [dndMounted, setDndMounted] = React.useState(false);
  const pendingColumnSignatureRef = React.useRef<string | null>(null);
  const pendingCardSignatureRef = React.useRef<string | null>(null);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragInProgressRef = React.useRef(false);
  const refreshQueuedDuringDragRef = React.useRef(false);

  React.useEffect(() => {
    setDndMounted(true);
  }, []);

  const colSig = columnsSignature(columns);
  React.useEffect(() => {
    const pendingColumnSig = pendingColumnSignatureRef.current;
    if (pendingColumnSig) {
      if (colSig === pendingColumnSig) {
        pendingColumnSignatureRef.current = null;
      } else {
        return;
      }
    }
    setColumnItems(columns);
  }, [boardId, colSig]);

  const cardSig = cardOrderSignature(cardsByColumnId);
  React.useEffect(() => {
    const pendingCardSig = pendingCardSignatureRef.current;
    if (pendingCardSig) {
      if (cardSig === pendingCardSig) {
        pendingCardSignatureRef.current = null;
      } else {
        return;
      }
    }
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

  const editingCard =
    editingCardId != null ? (cardsById.get(editingCardId) ?? null) : null;
  const memberNamesById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const member of membersForNewCard) {
      m.set(member.userId, member.displayName || member.email || "Участник");
    }
    return m;
  }, [membersForNewCard]);
  const memberAvatarsById = React.useMemo(() => {
    const m = new Map<string, string | null>();
    for (const member of membersForNewCard) {
      m.set(member.userId, member.avatarUrl ?? null);
    }
    return m;
  }, [membersForNewCard]);

  React.useEffect(() => {
    let cancelled = false;
    const scheduleRefresh = () => {
      if (cancelled) return;
      if (dragInProgressRef.current) {
        refreshQueuedDuringDragRef.current = true;
        return;
      }
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        if (!cancelled) {
          router.refresh();
        }
      }, 120);
    };
    try {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel(`realtime:board:${boardId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "cards",
            filter: `board_id=eq.${boardId}`
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "board_columns",
            filter: `board_id=eq.${boardId}`
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "board_members",
            filter: `board_id=eq.${boardId}`
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "labels",
            filter: `board_id=eq.${boardId}`
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "board_field_definitions",
            filter: `board_id=eq.${boardId}`
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "board_field_select_options"
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "board_card_preview_items",
            filter: `board_id=eq.${boardId}`
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "card_assignees"
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "card_labels"
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "card_comments"
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "card_field_values"
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "card_activity"
          },
          scheduleRefresh
        )
        .subscribe();

      return () => {
        cancelled = true;
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
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

  const handleDragStart = (_event: DragStartEvent) => {
    dragInProgressRef.current = true;
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    dragInProgressRef.current = false;
    if (refreshQueuedDuringDragRef.current) {
      refreshQueuedDuringDragRef.current = false;
      router.refresh();
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    dragInProgressRef.current = false;
    setPersistError(null);
    const { active, over } = event;
    if (!over) {
      if (refreshQueuedDuringDragRef.current) {
        refreshQueuedDuringDragRef.current = false;
        router.refresh();
      }
      return;
    }

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
      pendingColumnSignatureRef.current = columnsSignature(nextCols);

      const res = await reorderBoardColumnsAction(
        boardId,
        nextCols.map((c) => c.id)
      );

      if (!res.ok) {
        pendingColumnSignatureRef.current = null;
        setColumnItems(previousCols);
        setPersistError(res.message);
        return;
      }

      router.refresh();
      if (refreshQueuedDuringDragRef.current) {
        refreshQueuedDuringDragRef.current = false;
        router.refresh();
      }
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
    pendingCardSignatureRef.current = cardOrderRecordSignature(nextOrder);

    const layout = columnItems.map((c) => ({
      column_id: c.id,
      card_ids: nextOrder[c.id] ?? []
    }));

    const res = await reorderBoardCardsAction(boardId, layout);
    if (!res.ok) {
      pendingCardSignatureRef.current = null;
      setCardOrderByColumn(previousOrder);
      setPersistError(res.message);
      return;
    }

    router.refresh();
    if (refreshQueuedDuringDragRef.current) {
      refreshQueuedDuringDragRef.current = false;
      router.refresh();
    }
  };

  const editModal = (
    <EditCardModal
      open={editingCard != null}
      boardId={boardId}
      card={editingCard}
      boardLabels={boardLabels}
      canEditContent={
        editingCard ?
          canEditCardContent(
            cardContentPermissions,
            editingCard.createdByUserId,
            currentUserId
          ) || canEditCardBodyAsAssignee(editingCard, currentUserId)
        : false
      }
      canManageAssignees={
        editingCard ?
          canEditCardContent(
            cardContentPermissions,
            editingCard.createdByUserId,
            currentUserId
          )
        : false
      }
      canManageLabels={
        editingCard ?
          canEditCardContent(
            cardContentPermissions,
            editingCard.createdByUserId,
            currentUserId
          ) || canEditCardBodyAsAssignee(editingCard, currentUserId)
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
      canEditOwnComment={canEditOwnComment}
      canDeleteOwnComment={canDeleteOwnComment}
      canModerate={canModerateComments}
      currentUserId={currentUserId}
      boardMembers={membersForNewCard}
      fieldDefinitions={fieldDefinitions}
      onClose={() => setEditingCardId(null)}
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
          boardLabels={boardLabels}
          previewItems={previewItems}
          fieldDefinitions={fieldDefinitions}
          memberNamesById={memberNamesById}
          memberAvatarsById={memberAvatarsById}
          columnRows={columns}
          cardOrderByColumn={cardOrderByColumn}
          cardsById={cardsById}
          onOpenCard={(c) => setEditingCardId(c.id)}
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
          onOpenCard={(c) => setEditingCardId(c.id)}
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
              boardLabels={boardLabels}
              previewItems={previewItems}
              memberNamesById={memberNamesById}
              memberAvatarsById={memberAvatarsById}
              columnSortableEnabled
              onOpenCard={(c) => setEditingCardId(c.id)}
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
            boardLabels={boardLabels}
            previewItems={previewItems}
            memberNamesById={memberNamesById}
            memberAvatarsById={memberAvatarsById}
            onOpenCard={(c) => setEditingCardId(c.id)}
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        {columnRow}
      </DndContext>
    </div>
  );
}
