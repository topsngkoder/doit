"use client";

import type { CSSProperties } from "react";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
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

type BoardLocalState = {
  columnItems: ColumnRow[];
  cardsById: Map<string, BoardCardListItem>;
  cardOrderByColumn: Record<string, string[]>;
};

type CardLayoutBroadcastPayload = {
  v: 1;
  boardId: string;
  actorUserId: string;
  sentAt: number;
  cardOrderByColumn: Record<string, string[]>;
};

type ColumnLayoutRow = { id: string; name: string; column_type: string; position: number };
type CardLayoutRow = { id: string; column_id: string; position: number };

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

function buildCardsById(map: Map<string, BoardCardListItem[]>): Map<string, BoardCardListItem> {
  const m = new Map<string, BoardCardListItem>();
  for (const list of map.values()) {
    for (const c of list) {
      m.set(c.id, c);
    }
  }
  return m;
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

function sortCardIdsByPosition(ids: string[], cardsById: Map<string, BoardCardListItem>): string[] {
  return [...ids]
    .filter((id) => cardsById.has(id))
    .sort((a, b) => {
      const ca = cardsById.get(a);
      const cb = cardsById.get(b);
      const pa = ca ? Number(ca.position) : 0;
      const pb = cb ? Number(cb.position) : 0;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });
}

function buildCardOrderFromLayoutRows(
  columns: ColumnRow[],
  cardRows: CardLayoutRow[]
): Record<string, string[]> {
  const order: Record<string, string[]> = {};
  for (const col of columns) order[col.id] = [];
  const byColumn = new Map<string, Array<{ id: string; position: number }>>();
  for (const row of cardRows) {
    const colId = String(row.column_id);
    const list = byColumn.get(colId) ?? [];
    list.push({ id: String(row.id), position: Number(row.position ?? 0) });
    byColumn.set(colId, list);
  }
  for (const [colId, list] of byColumn) {
    const sorted = [...list].sort((a, b) => (a.position !== b.position ? a.position - b.position : a.id.localeCompare(b.id)));
    order[colId] = sorted.map((x) => x.id);
  }
  return order;
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
  const orderedAssigneeUserIds = React.useMemo(() => {
    if (!card.assigneeUserIds.length) return [];
    const assigneeIds = [...card.assigneeUserIds];
    if (!card.responsibleUserId) return assigneeIds;
    const withoutResponsible = assigneeIds.filter((id) => id !== card.responsibleUserId);
    return [card.responsibleUserId, ...withoutResponsible];
  }, [card.assigneeUserIds, card.responsibleUserId]);

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
                if (orderedAssigneeUserIds.length === 0) return null;
                return (
                  <div key={item.id} className="flex items-center -space-x-1">
                    {orderedAssigneeUserIds.slice(0, 4).map((userId) => {
                      const avatarUrl = memberAvatarsById.get(userId);
                      const displayName = memberNamesById.get(userId) ?? "Участник";
                      const isResponsible = userId === card.responsibleUserId;
                      return (
                        <span
                          key={userId}
                          className={`inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border bg-slate-700 text-[10px] font-medium text-slate-100 ${
                            isResponsible ? "border-amber-400" : "border-slate-800"
                          }`}
                          title={displayName}
                        >
                          {avatarUrl ?
                            <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                          : initials(displayName)}
                        </span>
                      );
                    })}
                    {orderedAssigneeUserIds.length > 4 ?
                      <span className="ml-1 text-[11px] text-slate-400">{`+${orderedAssigneeUserIds.length - 4}`}</span>
                    : null}
                  </div>
                );
              }
              if (item.itemType === "comments_count") {
                return (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[11px] text-slate-300"
                    title={`Комментариев: ${card.commentsCount}`}
                    aria-label={`Комментариев: ${card.commentsCount}`}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5 text-slate-400"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M3 3.5h10v6H8l-3 3v-3H3z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{card.commentsCount}</span>
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
  const [local, setLocal] = React.useState<BoardLocalState>(() => {
    const cardsById = buildCardsById(cardsByColumnId);
    const cardOrderByColumn = buildCardOrderRecord(cardsByColumnId);
    return {
      columnItems: [...columns].sort((a, b) => a.position - b.position),
      cardsById,
      cardOrderByColumn
    };
  });
  const [persistError, setPersistError] = React.useState<string | null>(null);
  const [editingCardId, setEditingCardId] = React.useState<string | null>(null);
  const [dndMounted, setDndMounted] = React.useState(false);
  const [realtimeStatus, setRealtimeStatus] = React.useState<string>("connecting");
  const [realtimeError, setRealtimeError] = React.useState<string | null>(null);
  const pendingColumnSignatureRef = React.useRef<string | null>(null);
  const pendingCardSignatureRef = React.useRef<string | null>(null);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragInProgressRef = React.useRef(false);
  const refreshQueuedDuringDragRef = React.useRef(false);
  const supabaseRef = React.useRef<SupabaseClient | null>(null);
  const channelRef = React.useRef<RealtimeChannel | null>(null);

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
    setLocal((prev) => ({
      ...prev,
      columnItems: [...columns].sort((a, b) => a.position - b.position)
    }));
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
    setLocal((prev) => ({
      ...prev,
      cardsById: buildCardsById(cardsByColumnId),
      cardOrderByColumn: buildCardOrderRecord(cardsByColumnId)
    }));
  }, [boardId, cardSig]);

  const editingCard =
    editingCardId != null ? (local.cardsById.get(editingCardId) ?? null) : null;
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
    const applyCardsChange = (payload: any) => {
      const eventType = String(payload?.eventType ?? "").toUpperCase();
      const nextRow = payload?.new ?? null;
      const oldRow = payload?.old ?? null;
      if (!eventType) return false;

      if (eventType === "INSERT") {
        if (!nextRow?.id || !nextRow?.column_id) return false;
        setLocal((prev) => {
          const cardsById = new Map(prev.cardsById);
          const existing = cardsById.get(nextRow.id);
          const merged: BoardCardListItem = {
            id: nextRow.id,
            title: String(nextRow.title ?? existing?.title ?? ""),
            description: String(nextRow.description ?? existing?.description ?? ""),
            position: Number(nextRow.position ?? existing?.position ?? 0),
            createdByUserId: String(nextRow.created_by_user_id ?? existing?.createdByUserId ?? ""),
            responsibleUserId:
              nextRow.responsible_user_id != null ?
                String(nextRow.responsible_user_id)
              : existing?.responsibleUserId ?? null,
            assigneeUserIds: existing?.assigneeUserIds ?? [],
            labelIds: existing?.labelIds ?? [],
            commentsCount: existing?.commentsCount ?? 0,
            fieldValues: existing?.fieldValues ?? {},
            activityEntries: existing?.activityEntries ?? []
          };
          cardsById.set(merged.id, merged);

          const cardOrderByColumn: Record<string, string[]> = { ...prev.cardOrderByColumn };
          const colId = String(nextRow.column_id);
          const ids = [...(cardOrderByColumn[colId] ?? [])];
          if (!ids.includes(merged.id)) ids.push(merged.id);
          cardOrderByColumn[colId] = sortCardIdsByPosition(ids, cardsById);
          return { ...prev, cardsById, cardOrderByColumn };
        });
        return true;
      }

      if (eventType === "UPDATE") {
        if (!nextRow?.id || !nextRow?.column_id) return false;
        setLocal((prev) => {
          const cardsById = new Map(prev.cardsById);
          const existing = cardsById.get(nextRow.id);
          if (!existing) {
            // Если карточку ещё не знаем (например, только что появилась) — попробуем как insert.
            const merged: BoardCardListItem = {
              id: nextRow.id,
              title: String(nextRow.title ?? ""),
              description: String(nextRow.description ?? ""),
              position: Number(nextRow.position ?? 0),
              createdByUserId: String(nextRow.created_by_user_id ?? ""),
              responsibleUserId: nextRow.responsible_user_id != null ? String(nextRow.responsible_user_id) : null,
              assigneeUserIds: [],
              labelIds: [],
              commentsCount: 0,
              fieldValues: {},
              activityEntries: []
            };
            cardsById.set(merged.id, merged);
          } else {
            cardsById.set(existing.id, {
              ...existing,
              title: nextRow.title != null ? String(nextRow.title) : existing.title,
              description: nextRow.description != null ? String(nextRow.description) : existing.description,
              position: nextRow.position != null ? Number(nextRow.position) : existing.position,
              responsibleUserId:
                nextRow.responsible_user_id === null ?
                  null
                : nextRow.responsible_user_id != null ?
                  String(nextRow.responsible_user_id)
                : existing.responsibleUserId
            });
          }

          const cardId = String(nextRow.id);
          const newColId = String(nextRow.column_id);
          const oldColId =
            oldRow?.column_id != null ? String(oldRow.column_id) : findColumnForCard(prev.cardOrderByColumn, cardId);

          const cardOrderByColumn: Record<string, string[]> = { ...prev.cardOrderByColumn };
          if (oldColId && oldColId !== newColId) {
            cardOrderByColumn[oldColId] = (cardOrderByColumn[oldColId] ?? []).filter((id) => id !== cardId);
          }
          const newIds = [...(cardOrderByColumn[newColId] ?? [])];
          if (!newIds.includes(cardId)) newIds.push(cardId);
          cardOrderByColumn[newColId] = sortCardIdsByPosition(newIds, cardsById);

          if (oldColId && oldColId !== newColId) {
            cardOrderByColumn[oldColId] = sortCardIdsByPosition(cardOrderByColumn[oldColId] ?? [], cardsById);
          }

          return { ...prev, cardsById, cardOrderByColumn };
        });
        return true;
      }

      if (eventType === "DELETE") {
        if (!oldRow?.id) return false;
        const cardId = String(oldRow.id);
        const colId = oldRow.column_id != null ? String(oldRow.column_id) : null;
        setLocal((prev) => {
          const cardsById = new Map(prev.cardsById);
          cardsById.delete(cardId);
          const cardOrderByColumn: Record<string, string[]> = { ...prev.cardOrderByColumn };
          if (colId) {
            cardOrderByColumn[colId] = (cardOrderByColumn[colId] ?? []).filter((id) => id !== cardId);
          } else {
            for (const k of Object.keys(cardOrderByColumn)) {
              cardOrderByColumn[k] = (cardOrderByColumn[k] ?? []).filter((id) => id !== cardId);
            }
          }
          return { ...prev, cardsById, cardOrderByColumn };
        });
        setEditingCardId((cur) => (cur === cardId ? null : cur));
        return true;
      }

      return false;
    };

    const applyColumnsChange = (payload: any) => {
      const eventType = String(payload?.eventType ?? "").toUpperCase();
      const nextRow = payload?.new ?? null;
      const oldRow = payload?.old ?? null;
      if (!eventType) return false;

      if (eventType === "INSERT") {
        if (!nextRow?.id) return false;
        setLocal((prev) => {
          const next: ColumnRow = {
            id: String(nextRow.id),
            name: String(nextRow.name ?? ""),
            columnType: String(nextRow.column_type ?? ""),
            position: Number(nextRow.position ?? 0)
          };
          const exists = prev.columnItems.some((c) => c.id === next.id);
          const columnItems = exists ?
              prev.columnItems.map((c) => (c.id === next.id ? next : c)).sort((a, b) => a.position - b.position)
            : [...prev.columnItems, next].sort((a, b) => a.position - b.position);
          const cardOrderByColumn: Record<string, string[]> = { ...prev.cardOrderByColumn };
          if (!cardOrderByColumn[next.id]) cardOrderByColumn[next.id] = [];
          return { ...prev, columnItems, cardOrderByColumn };
        });
        return true;
      }

      if (eventType === "UPDATE") {
        if (!nextRow?.id) return false;
        setLocal((prev) => {
          const nextId = String(nextRow.id);
          const columnItems = prev.columnItems
            .map((c) => {
              if (c.id !== nextId) return c;
              return {
                ...c,
                name: nextRow.name != null ? String(nextRow.name) : c.name,
                columnType: nextRow.column_type != null ? String(nextRow.column_type) : c.columnType,
                position: nextRow.position != null ? Number(nextRow.position) : c.position
              };
            })
            .sort((a, b) => a.position - b.position);
          return { ...prev, columnItems };
        });
        return true;
      }

      if (eventType === "DELETE") {
        if (!oldRow?.id) return false;
        const deletedId = String(oldRow.id);
        setLocal((prev) => {
          const columnItems = prev.columnItems.filter((c) => c.id !== deletedId);
          const cardOrderByColumn: Record<string, string[]> = { ...prev.cardOrderByColumn };
          delete cardOrderByColumn[deletedId];
          return { ...prev, columnItems, cardOrderByColumn };
        });
        return true;
      }

      return false;
    };

    const applyCardAssigneesChange = (payload: any) => {
      const eventType = String(payload?.eventType ?? "").toUpperCase();
      const nextRow = payload?.new ?? null;
      const oldRow = payload?.old ?? null;
      if (!eventType) return false;
      const cardId =
        eventType === "DELETE" ? (oldRow?.card_id ? String(oldRow.card_id) : null) : nextRow?.card_id ? String(nextRow.card_id) : null;
      const userId =
        eventType === "DELETE" ? (oldRow?.user_id ? String(oldRow.user_id) : null) : nextRow?.user_id ? String(nextRow.user_id) : null;
      if (!cardId || !userId) return false;

      let applied = false;
      setLocal((prev) => {
        const existing = prev.cardsById.get(cardId);
        if (!existing) return prev;
        const cardsById = new Map(prev.cardsById);
        const set = new Set(existing.assigneeUserIds);
        if (eventType === "INSERT") set.add(userId);
        if (eventType === "DELETE") set.delete(userId);
        cardsById.set(cardId, { ...existing, assigneeUserIds: [...set] });
        applied = true;
        return { ...prev, cardsById };
      });
      return applied;
    };

    const applyCardLabelsChange = (payload: any) => {
      const eventType = String(payload?.eventType ?? "").toUpperCase();
      const nextRow = payload?.new ?? null;
      const oldRow = payload?.old ?? null;
      if (!eventType) return false;
      const cardId =
        eventType === "DELETE" ? (oldRow?.card_id ? String(oldRow.card_id) : null) : nextRow?.card_id ? String(nextRow.card_id) : null;
      const labelId =
        eventType === "DELETE" ? (oldRow?.label_id ? String(oldRow.label_id) : null) : nextRow?.label_id ? String(nextRow.label_id) : null;
      if (!cardId || !labelId) return false;

      let applied = false;
      setLocal((prev) => {
        const existing = prev.cardsById.get(cardId);
        if (!existing) return prev;
        const cardsById = new Map(prev.cardsById);
        const set = new Set(existing.labelIds);
        if (eventType === "INSERT") set.add(labelId);
        if (eventType === "DELETE") set.delete(labelId);
        cardsById.set(cardId, { ...existing, labelIds: [...set] });
        applied = true;
        return { ...prev, cardsById };
      });
      return applied;
    };

    const applyCardFieldValuesChange = (payload: any) => {
      const eventType = String(payload?.eventType ?? "").toUpperCase();
      const nextRow = payload?.new ?? null;
      const oldRow = payload?.old ?? null;
      if (!eventType) return false;
      const cardId =
        eventType === "DELETE" ? (oldRow?.card_id ? String(oldRow.card_id) : null) : nextRow?.card_id ? String(nextRow.card_id) : null;
      const fieldId =
        eventType === "DELETE"
          ? oldRow?.field_definition_id ? String(oldRow.field_definition_id) : null
          : nextRow?.field_definition_id ? String(nextRow.field_definition_id) : null;
      if (!cardId || !fieldId) return false;

      let applied = false;
      setLocal((prev) => {
        const existing = prev.cardsById.get(cardId);
        if (!existing) return prev;
        const cardsById = new Map(prev.cardsById);
        const fieldValues = { ...(existing.fieldValues ?? {}) };
        if (eventType === "DELETE") {
          delete fieldValues[fieldId];
        } else {
          fieldValues[fieldId] = {
            textValue: nextRow?.text_value ?? null,
            dateValue: nextRow?.date_value ?? null,
            linkUrl: nextRow?.link_url ?? null,
            linkText: nextRow?.link_text ?? null,
            selectOptionId: nextRow?.select_option_id ?? null
          };
        }
        cardsById.set(cardId, { ...existing, fieldValues });
        applied = true;
        return { ...prev, cardsById };
      });
      return applied;
    };

    const applyCardCommentsChange = (payload: any) => {
      const eventType = String(payload?.eventType ?? "").toUpperCase();
      const nextRow = payload?.new ?? null;
      const oldRow = payload?.old ?? null;
      if (!eventType) return false;
      const cardId =
        eventType === "DELETE" ? (oldRow?.card_id ? String(oldRow.card_id) : null) : nextRow?.card_id ? String(nextRow.card_id) : null;
      if (!cardId) return false;

      let delta = 0;
      if (eventType === "INSERT") {
        // Считаем только не удалённые комментарии.
        if (nextRow?.deleted_at == null) delta = 1;
      } else if (eventType === "UPDATE") {
        const wasDeleted = oldRow?.deleted_at != null;
        const isDeleted = nextRow?.deleted_at != null;
        if (!wasDeleted && isDeleted) delta = -1;
        if (wasDeleted && !isDeleted) delta = 1;
      } else {
        // DELETE в приложении для card_comments не используется (soft-delete).
        return false;
      }

      if (delta === 0) return true;

      let applied = false;
      setLocal((prev) => {
        const existing = prev.cardsById.get(cardId);
        if (!existing) return prev;
        const cardsById = new Map(prev.cardsById);
        const nextCount = Math.max(0, Number(existing.commentsCount ?? 0) + delta);
        cardsById.set(cardId, { ...existing, commentsCount: nextCount });
        applied = true;
        return { ...prev, cardsById };
      });
      return applied;
    };

    const applyCardActivityChange = (payload: any) => {
      const eventType = String(payload?.eventType ?? "").toUpperCase();
      const nextRow = payload?.new ?? null;
      if (eventType !== "INSERT") return false;
      if (!nextRow?.card_id || !nextRow?.id) return false;
      const cardId = String(nextRow.card_id);
      let applied = false;
      setLocal((prev) => {
        const existing = prev.cardsById.get(cardId);
        if (!existing) return prev;
        const cardsById = new Map(prev.cardsById);
        const entry = {
          id: String(nextRow.id),
          activityType: String(nextRow.activity_type ?? ""),
          message: String(nextRow.message ?? ""),
          createdAt: String(nextRow.created_at ?? new Date().toISOString()),
          actorUserId: String(nextRow.actor_user_id ?? ""),
          actorDisplayName: String(nextRow.actor_display_name ?? "Участник")
        };
        const prevList = existing.activityEntries ?? [];
        // Новые сверху, id — дедуп для идемпотентности.
        const nextList = prevList.some((e) => e.id === entry.id) ? prevList : [entry, ...prevList];
        cardsById.set(cardId, { ...existing, activityEntries: nextList });
        applied = true;
        return { ...prev, cardsById };
      });
      return applied;
    };

    try {
      const supabase = createSupabaseBrowserClient();
      supabaseRef.current = supabase;
      const channel = supabase
        .channel(`realtime:board:${boardId}`, {
          config: {
            broadcast: { self: true }
          }
        })
        .on(
          "broadcast",
          { event: "card_layout" },
          (raw) => {
            const msg = raw?.payload as Partial<CardLayoutBroadcastPayload> | undefined;
            if (!msg || msg.v !== 1) return;
            if (msg.boardId !== boardId) return;
            if (msg.actorUserId === currentUserId) return;
            if (!msg.cardOrderByColumn) return;
            if (dragInProgressRef.current) return;
            setLocal((prev) => {
              const merged: Record<string, string[]> = { ...prev.cardOrderByColumn };
              for (const [colId, ids] of Object.entries(msg.cardOrderByColumn ?? {})) {
                merged[colId] = Array.isArray(ids) ? ids.map(String) : [];
              }
              return { ...prev, cardOrderByColumn: merged };
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "cards",
            filter: `board_id=eq.${boardId}`
          },
          (payload) => {
            const ok = applyCardsChange(payload);
            if (!ok) scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "board_columns",
            filter: `board_id=eq.${boardId}`
          },
          (payload) => {
            const ok = applyColumnsChange(payload);
            if (!ok) scheduleRefresh();
          }
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
          (payload) => {
            const ok = applyCardAssigneesChange(payload);
            if (!ok) scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "card_labels"
          },
          (payload) => {
            const ok = applyCardLabelsChange(payload);
            if (!ok) scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "card_comments"
          },
          (payload) => {
            const ok = applyCardCommentsChange(payload);
            if (!ok) scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "card_field_values"
          },
          (payload) => {
            const ok = applyCardFieldValuesChange(payload);
            if (!ok) scheduleRefresh();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "card_activity"
          },
          (payload) => {
            const ok = applyCardActivityChange(payload);
            if (!ok) scheduleRefresh();
          }
        )
        .subscribe((status, err) => {
          setRealtimeStatus(status);
          setRealtimeError(err ? String((err as any)?.message ?? err) : null);
        });

      channelRef.current = channel;
      return () => {
        cancelled = true;
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
        channelRef.current = null;
        supabaseRef.current = null;
        void supabase.removeChannel(channel);
      };
    } catch {
      return () => {};
    }
  }, [boardId, currentUserId, router]);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      const supabase = supabaseRef.current;
      if (!supabase) return;
      if (document.visibilityState === "hidden") return;
      if (dragInProgressRef.current) return;

      const [colsRes, cardsRes] = await Promise.all([
        supabase
          .from("board_columns")
          .select("id,name,column_type,position")
          .eq("board_id", boardId)
          .order("position", { ascending: true }),
        supabase
          .from("cards")
          .select("id,column_id,position")
          .eq("board_id", boardId)
          .order("position", { ascending: true })
      ]);

      if (cancelled) return;
      if (colsRes.error || cardsRes.error) return;
      const cols = (colsRes.data ?? []) as unknown as ColumnLayoutRow[];
      const cards = (cardsRes.data ?? []) as unknown as CardLayoutRow[];

      const columnItems: ColumnRow[] = cols
        .map((c) => ({
          id: String(c.id),
          name: String(c.name ?? ""),
          columnType: String(c.column_type ?? ""),
          position: Number(c.position ?? 0)
        }))
        .sort((a, b) => a.position - b.position);

      const cardOrderByColumn = buildCardOrderFromLayoutRows(columnItems, cards);

      setLocal((prev) => {
        // Обновляем только layout; контент карточек оставляем как был (title/labels/etc),
        // иначе polling может “затирать” быстрые изменения из других realtime-таблиц.
        const cardsById = new Map(prev.cardsById);
        for (const row of cards) {
          const id = String(row.id);
          const existing = cardsById.get(id);
          if (!existing) continue;
          const nextPos = Number(row.position ?? existing.position);
          if (existing.position !== nextPos) {
            cardsById.set(id, { ...existing, position: nextPos });
          }
        }
        return { ...prev, columnItems, cardOrderByColumn, cardsById };
      });
    };

    // Если realtime не подключился — включаем лёгкий polling layout.
    if (realtimeStatus !== "SUBSCRIBED") {
      void run();
      timer = setInterval(() => {
        void run();
      }, 1000);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [boardId, realtimeStatus]);

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

      const oldIndex = local.columnItems.findIndex((c) => c.id === activeKey);
      const newIndex = local.columnItems.findIndex((c) => c.id === overKey);
      if (oldIndex < 0 || newIndex < 0) return;

      const previousCols = local.columnItems;
      const nextCols = arrayMove(local.columnItems, oldIndex, newIndex);
      setLocal((prev) => ({ ...prev, columnItems: nextCols }));
      pendingColumnSignatureRef.current = columnsSignature(nextCols);

      const res = await reorderBoardColumnsAction(
        boardId,
        nextCols.map((c) => c.id)
      );

      if (!res.ok) {
        pendingColumnSignatureRef.current = null;
        setLocal((prev) => ({ ...prev, columnItems: previousCols }));
        setPersistError(res.message);
        return;
      }

      // На успехе не делаем полный refresh: локальный state уже переставлен,
      // остальные клиенты получат UPDATE через realtime (board_columns).
      if (refreshQueuedDuringDragRef.current) {
        refreshQueuedDuringDragRef.current = false;
        router.refresh();
      }
      return;
    }

    if (!canMoveCards) return;

    if (String(active.id) === String(over.id)) return;

    const activeCardId = String(active.id);
    const fromCol = findColumnForCard(local.cardOrderByColumn, activeCardId);
    if (!fromCol) return;

    const target = resolveCardDropTarget(over.id, local.cardOrderByColumn);
    if (!target) return;

    if (
      fromCol === target.columnId &&
      local.cardOrderByColumn[fromCol].indexOf(activeCardId) === target.index
    ) {
      return;
    }

    const previousOrder = local.cardOrderByColumn;
    const nextOrder = applyCardReorder(local.cardOrderByColumn, activeCardId, fromCol, target);
    setLocal((prev) => ({ ...prev, cardOrderByColumn: nextOrder }));
    pendingCardSignatureRef.current = cardOrderRecordSignature(nextOrder);

    const layout = local.columnItems.map((c) => ({
      column_id: c.id,
      card_ids: nextOrder[c.id] ?? []
    }));

    const res = await reorderBoardCardsAction(boardId, layout);
    if (!res.ok) {
      pendingCardSignatureRef.current = null;
      setLocal((prev) => ({ ...prev, cardOrderByColumn: previousOrder }));
      setPersistError(res.message);
      return;
    }

    // Отправляем "быстрый" broadcast с новым layout, чтобы другие клиенты обновились мгновенно,
    // не дожидаясь серии postgres_changes + (потенциально) медленного refresh.
    try {
      const payload: CardLayoutBroadcastPayload = {
        v: 1,
        boardId,
        actorUserId: currentUserId,
        sentAt: Date.now(),
        cardOrderByColumn: nextOrder
      };
      await channelRef.current?.send({
        type: "broadcast",
        event: "card_layout",
        payload
      });
    } catch {
      // ignore
    }

    // На успехе не делаем полный refresh: локальный state уже переставлен,
    // остальные детали (responsible/activity и т.п.) прилетят точечно через postgres_changes.
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
          memberNamesById={memberNamesById}
          memberAvatarsById={memberAvatarsById}
          columnRows={columns}
          cardOrderByColumn={local.cardOrderByColumn}
          cardsById={local.cardsById}
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
          boardLabels={boardLabels}
          previewItems={previewItems}
          memberNamesById={memberNamesById}
          memberAvatarsById={memberAvatarsById}
          columnRows={local.columnItems}
          cardOrderByColumn={local.cardOrderByColumn}
          cardsById={local.cardsById}
          onOpenCard={(c) => setEditingCardId(c.id)}
        />
      </>
    );
  }

  const columnRow =
    showColumnDnd ?
      <SortableContext
        items={local.columnItems.map((c) => columnDndId(c.id))}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex gap-4 overflow-x-auto pb-2">
          {local.columnItems.map((col, index) => (
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
              columnCount={local.columnItems.length}
              columnPermissions={columnPermissions}
              cardContentPermissions={cardContentPermissions}
              cardIds={local.cardOrderByColumn[col.id] ?? []}
              cardsById={local.cardsById}
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
        {local.columnItems.map((col, index) => (
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
            columnCount={local.columnItems.length}
            columnPermissions={columnPermissions}
            cardContentPermissions={cardContentPermissions}
            cardIds={local.cardOrderByColumn[col.id] ?? []}
            cardsById={local.cardsById}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          Realtime:{" "}
          <span className={realtimeStatus === "SUBSCRIBED" ? "text-emerald-400" : "text-amber-400"}>
            {realtimeStatus}
          </span>
          {realtimeError ? <span className="ml-2 text-rose-400">{realtimeError}</span> : null}
        </p>
      </div>
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
