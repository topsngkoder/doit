"use client";

import type { CSSProperties } from "react";
import * as React from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
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
import { cn } from "@/lib/utils";
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
/** Окно подавления открытия модалки после drag карточки (хвостовой click / touch synthetic click). */
const CARD_DRAG_SUPPRESS_MODAL_OPEN_MS = 500;
const COLUMN_SHELL_CLASS =
  "flex max-h-full w-72 shrink-0 flex-col gap-3 rounded-[var(--radius-surface)] border border-app-default bg-[color:var(--board-column-bg)] p-3 shadow-[var(--shadow-card)] backdrop-blur-sm";

function columnDndId(columnId: string) {
  return `${COLUMN_DND_PREFIX}${columnId}`;
}

function isColumnDndId(id: UniqueIdentifier) {
  return String(id).startsWith(COLUMN_DND_PREFIX);
}

function parseColumnDndId(id: UniqueIdentifier) {
  return String(id).slice(COLUMN_DND_PREFIX.length);
}

function canRenderCreateCardButton(columnType: string): boolean {
  return columnType === "queue" || columnType === "info";
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

type CardSlotPosition = { columnId: string; index: number };

type CardDragOverlayState = {
  activeCardId: string;
  card: BoardCardListItem;
  overlaySize: { width: number; height: number };
  sourceColumnId: string;
  sourceIndex: number;
  currentSlot: CardSlotPosition;
  lastValidSlot: CardSlotPosition;
};

type CardDisplayRow = { kind: "card"; id: string } | { kind: "slot" };

const BOARD_CARD_SLOT_LIST_KEY = "__board_card_slot__";

function buildCardDisplayFlowForColumn(
  columnId: string,
  cardOrderByColumn: Record<string, string[]>,
  activeCardId: string,
  slot: CardSlotPosition
): CardDisplayRow[] {
  const ids = cardOrderByColumn[columnId] ?? [];
  const stripped = ids.filter((id) => id !== activeCardId);
  if (slot.columnId !== columnId) {
    return stripped.map((id) => ({ kind: "card" as const, id }));
  }
  const insertAt = Math.max(0, Math.min(slot.index, stripped.length));
  const out: CardDisplayRow[] = [];
  for (let j = 0; j < stripped.length; j++) {
    if (j === insertAt) out.push({ kind: "slot" });
    out.push({ kind: "card", id: stripped[j]! });
  }
  if (insertAt === stripped.length) out.push({ kind: "slot" });
  return out;
}

/** Порядок `items` в `SortableContext` при float-drag: как порядок DOM (якорь активной карточки, затем карточки из `displayFlow`). Иначе стратегия видит off-screen якорь и неверные индексы — соседи получают огромные `transform`. */
function sortableCardIdsForFloatDragColumn(
  columnId: string,
  cardOrderByColumn: Record<string, string[]>,
  overlay: CardDragOverlayState
): string[] {
  const flow = buildCardDisplayFlowForColumn(
    columnId,
    cardOrderByColumn,
    overlay.activeCardId,
    overlay.lastValidSlot
  );
  const fromFlow = flow
    .filter((r): r is { kind: "card"; id: string } => r.kind === "card")
    .map((r) => r.id);
  return columnId === overlay.sourceColumnId ?
      [overlay.activeCardId, ...fromFlow]
    : fromFlow;
}

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
  cardOrder: Record<string, string[]>,
  allowedColumnIds?: Set<string>
): { columnId: string; index: number } | null {
  const oid = String(overId);
  if (oid.startsWith("empty-")) {
    const colId = oid.slice("empty-".length);
    if (allowedColumnIds && !allowedColumnIds.has(colId)) return null;
    const list = cardOrder[colId];
    if (!list) return null;
    return { columnId: colId, index: list.length };
  }
  if (isColumnDndId(overId)) {
    const colId = parseColumnDndId(overId);
    if (allowedColumnIds && !allowedColumnIds.has(colId)) return null;
    const list = cardOrder[colId];
    if (!list) return null;
    return { columnId: colId, index: list.length };
  }
  for (const [colId, ids] of Object.entries(cardOrder)) {
    if (allowedColumnIds && !allowedColumnIds.has(colId)) continue;
    const idx = ids.indexOf(oid);
    if (idx >= 0) return { columnId: colId, index: idx };
  }
  return null;
}

/**
 * Позиция вставки в координатах виртуального списка (после удаления activeCardId из всех колонок) — см. FDND1.2 / `buildCardDisplayFlowForColumn`.
 */
function resolveCardDropTargetVirtual(
  overId: UniqueIdentifier,
  cardOrder: Record<string, string[]>,
  activeCardId: string,
  allowedColumnIds?: Set<string>
): { columnId: string; index: number } | null {
  const oid = String(overId);
  if (oid === BOARD_CARD_SLOT_LIST_KEY) return null;
  if (oid.startsWith("empty-")) {
    const colId = oid.slice("empty-".length);
    if (allowedColumnIds && !allowedColumnIds.has(colId)) return null;
    const list = cardOrder[colId];
    if (!list) return null;
    const stripped = list.filter((id) => id !== activeCardId);
    return { columnId: colId, index: stripped.length };
  }
  if (isColumnDndId(overId)) {
    const colId = parseColumnDndId(overId);
    if (allowedColumnIds && !allowedColumnIds.has(colId)) return null;
    const list = cardOrder[colId];
    if (!list) return null;
    const stripped = list.filter((id) => id !== activeCardId);
    return { columnId: colId, index: stripped.length };
  }
  for (const [colId, ids] of Object.entries(cardOrder)) {
    if (allowedColumnIds && !allowedColumnIds.has(colId)) continue;
    const idx = ids.indexOf(oid);
    if (idx < 0) continue;
    if (oid === activeCardId) return null;
    const sourceIdx = ids.indexOf(activeCardId);
    const virtualIndex = sourceIdx < 0 ? idx : idx < sourceIdx ? idx : idx - 1;
    return { columnId: colId, index: virtualIndex };
  }
  return null;
}

/** Виртуальный slot → индексы полных массивов для `applyCardReorder`. */
function virtualCardSlotToApplyTarget(
  cardOrder: Record<string, string[]>,
  activeCardId: string,
  fromCol: string,
  virtual: { columnId: string; index: number }
): { columnId: string; index: number } | null {
  const fromArr = cardOrder[fromCol];
  const posInFrom = fromArr.indexOf(activeCardId);
  if (posInFrom < 0) return null;

  if (virtual.columnId !== fromCol) {
    const toArr = cardOrder[virtual.columnId];
    if (!toArr) return null;
    const insertAt = Math.max(0, Math.min(virtual.index, toArr.length));
    return { columnId: virtual.columnId, index: insertAt };
  }

  const stripped = fromArr.filter((id) => id !== activeCardId);
  const v = Math.max(0, Math.min(virtual.index, stripped.length));
  const merged = [...stripped.slice(0, v), activeCardId, ...stripped.slice(v)];
  const realIndex = merged.indexOf(activeCardId);
  return { columnId: fromCol, index: realIndex };
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

function reorderVisibleColumnsInGlobalOrder(
  allColumns: ColumnRow[],
  visibleColumnIds: Set<string>,
  activeColumnId: string,
  overColumnId: string
): ColumnRow[] {
  const visibleColumns = allColumns.filter((column) => visibleColumnIds.has(column.id));
  const oldVisibleIndex = visibleColumns.findIndex((column) => column.id === activeColumnId);
  const newVisibleIndex = visibleColumns.findIndex((column) => column.id === overColumnId);
  if (oldVisibleIndex < 0 || newVisibleIndex < 0) return allColumns;
  const reorderedVisibleColumns = arrayMove(visibleColumns, oldVisibleIndex, newVisibleIndex);

  let visiblePointer = 0;
  return allColumns.map((column) => {
    if (!visibleColumnIds.has(column.id)) return column;
    const nextVisibleColumn = reorderedVisibleColumns[visiblePointer];
    visiblePointer += 1;
    return nextVisibleColumn ?? column;
  });
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
        emphasized ? "min-h-12 rounded-md border border-dashed border-app-strong bg-app-surface-muted/40 py-3"
        : "min-h-2 shrink-0"
      }
      style={
        isOver ? { boxShadow: "inset 0 0 0 var(--focus-ring-width) var(--focus-ring)" } : undefined
      }
    />
  );
}

/** Slot вставки в вертикальном списке карточек колонки: полная ширина дорожки, фиксированная высота; межкарточный интервал — `gap-2` у контейнера списка. */
function BoardCardInsertSlot({
  heightPx,
  className
}: {
  heightPx: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full min-w-0 max-w-full shrink-0 rounded-[var(--radius-control)] border border-dashed border-app-divider bg-app-surface-muted/25",
        className
      )}
      style={{ height: heightPx, minHeight: heightPx }}
      aria-hidden
    />
  );
}

/** Пустая колонка во время card-drag: тот же id `empty-${columnId}`, что у `EmptyColumnDrop`, но высота = slot карточки (FDND3.4). */
function EmptyColumnCardDropSlot({ columnId, heightPx }: { columnId: string; heightPx: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `empty-${columnId}`,
    data: { type: "empty-column" as const, columnId }
  });
  return (
    <div
      ref={setNodeRef}
      className="w-full min-w-0 shrink-0 rounded-[var(--radius-control)]"
      style={
        isOver ? { boxShadow: "inset 0 0 0 var(--focus-ring-width) var(--focus-ring)" } : undefined
      }
    >
      <BoardCardInsertSlot heightPx={heightPx} />
    </div>
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
  sortableDragSurface,
  /** Только визуальный parity с drag-surface до mount `@dnd-kit` (см. `BoardGridStatic`, план DND7.1). Без listeners/attributes. */
  visualMoveSurface = false,
  isSortableDragging = false,
  shouldSuppressCardModalOpenClick,
  disableOpen = false
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
  sortableDragSurface?: Pick<
    ReturnType<typeof useSortable>,
    "attributes" | "listeners" | "setActivatorNodeRef"
  >;
  visualMoveSurface?: boolean;
  /** Визуальное состояние drag для курсора `grabbing` на всей поверхности карточки. */
  isSortableDragging?: boolean;
  /** Подавление открытия после завершённого drag карточки (хвостовой `click`). */
  shouldSuppressCardModalOpenClick?: () => boolean;
  /** Overlay использует тот же визуальный компонент, но без открытия модалки. */
  disableOpen?: boolean;
}) {
  const canOpen = !disableOpen && canOpenCardModal(cardContentPermissions, card, currentUserId);
  // Матрица move × open (`canMoveCards` → sortableDragSurface или visualMoveSurface до mount, `canOpenCardModal` → canOpen), план DND3.x / DND6.x / DND7.1:
  // — sortableDragSurface && !canOpen: только drag, без открытия (DND3.2); tabIndex снят с последовательного фокуса (DND6.1).
  // — !sortableDragSurface && canOpen: клик/Enter/Space по всей поверхности, без drag listeners (DND3.3).
  // — sortableDragSurface && canOpen: drag + открытие, с anti-click после drag (DND3.1); Enter/Space на корне + атрибуты sortable (DND6.1).
  // — !sortableDragSurface && !canOpen: статичный блок — без role кнопки, tabIndex, listeners, cursor-pointer, hover/focus chrome (DND3.4).
  // — DND6.2: превью внутри — только div/span/img/svg (svg с focusable=false); отдельных control/tabIndex у детей нет — tab stop только корень карточки.
  const enabledPreviewItems = previewItems
    .filter((i) => i.enabled)
    .sort((a, b) => a.position - b.position);
  const labelsById = new Map(boardLabels.map((l) => [l.id, l]));
  const fieldDefsById = new Map(fieldDefinitions.map((f) => [f.id, f]));
  const labelsPreviewEnabled = enabledPreviewItems.some((item) => item.itemType === "labels");
  const cardLabels = card.labelIds
    .map((id) => labelsById.get(id))
    .filter((label): label is BoardLabelOption => label !== undefined)
    .sort((a, b) => a.position - b.position) as BoardLabelOption[];
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

  const assignSortableActivatorRef = sortableDragSurface?.setActivatorNodeRef;
  const cardSurfaceRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      assignSortableActivatorRef?.(node);
    },
    [assignSortableActivatorRef]
  );

  // DND6.1: при только drag (move=yes, open=no) не ставим карточку в tab order ради dnd-kit —
  // иначе `useSortable` даёт tabIndex:0 + role button на всей поверхности.
  const sortableSurfaceAttributes =
    sortableDragSurface ?
      canOpen ? sortableDragSurface.attributes
      : { ...sortableDragSurface.attributes, tabIndex: -1 as const }
    : undefined;

  const hasMoveSurface = Boolean(sortableDragSurface) || visualMoveSurface;
  const surfaceInteractive = canOpen || hasMoveSurface;
  const cursorClass =
    hasMoveSurface ?
      isSortableDragging ? "cursor-grabbing"
      : "cursor-grab active:cursor-grabbing"
    : canOpen ? "cursor-pointer"
    : "";
  const interactiveChrome = surfaceInteractive ?
    "transition-[border-color,box-shadow] hover:border-app-strong focus-visible:outline-none focus-visible:shadow-[0_0_0_var(--focus-ring-width)_var(--focus-ring)]"
  : "";

  return (
    <div
      ref={sortableDragSurface ? cardSurfaceRef : undefined}
      className={[
        "flex rounded-[var(--radius-control)] border border-app-default bg-app-surface px-3 py-2 text-sm text-app-primary shadow-[var(--shadow-card)]",
        hasMoveSurface ? "select-none" : "",
        cursorClass,
        interactiveChrome
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        primaryLabel ?
          {
            borderLeftWidth: 4,
            borderLeftColor: primaryLabel.color,
            backgroundColor: `color-mix(in srgb, ${primaryLabel.color} 16%, var(--bg-surface))`
          }
        : undefined
      }
      {...(sortableDragSurface?.listeners ?? {})}
      {...(sortableSurfaceAttributes ?? {})}
      {...(!sortableDragSurface && canOpen ? { role: "button" as const, tabIndex: 0 as const } : {})}
      onClick={
        canOpen ?
          () => {
            if (
              sortableDragSurface &&
              shouldSuppressCardModalOpenClick?.()
            ) {
              return;
            }
            onOpen(card);
          }
        : undefined
      }
      onKeyDown={
        canOpen ?
          (e) => {
            if (e.key === "Enter" || e.key === " ") {
              if (
                sortableDragSurface &&
                shouldSuppressCardModalOpenClick?.()
              ) {
                return;
              }
              e.preventDefault();
              onOpen(card);
            }
          }
        : undefined
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 min-w-0 text-[16px]">{card.title}</span>
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
                          className={`inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border bg-app-surface-muted text-[10px] font-medium text-app-secondary ${
                            isResponsible ? "border-[color:var(--warning-strong)]" : "border-app-default"
                          }`}
                          title={displayName}
                        >
                          {avatarUrl ?
                            <img
                              src={avatarUrl}
                              alt={displayName}
                              draggable={false}
                              className="h-full w-full object-cover"
                            />
                          : initials(displayName)}
                        </span>
                      );
                    })}
                    {orderedAssigneeUserIds.length > 4 ?
                      <span className="ml-1 text-[11px] text-app-tertiary">{`+${orderedAssigneeUserIds.length - 4}`}</span>
                    : null}
                  </div>
                );
              }
              if (item.itemType === "comments_count") {
                return (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1 rounded bg-app-surface-muted px-1.5 py-0.5 text-[11px] text-app-secondary"
                    title={`Комментариев: ${card.commentsCount}`}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5 text-app-tertiary"
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
                if (cardLabels.length === 0) return null;
                return (
                  <div key={item.id} className="flex flex-wrap items-center gap-1">
                    {cardLabels.map((label) => (
                      <span
                        key={label.id}
                        className="inline-flex max-w-full items-center rounded border px-1.5 py-0.5 text-[11px]"
                        style={{
                          borderColor: label.color,
                          backgroundColor: `color-mix(in srgb, ${label.color} 16%, var(--bg-surface))`,
                          color: "var(--text-primary)"
                        }}
                      >
                        <span className="min-w-0 truncate">{label.name}</span>
                      </span>
                    ))}
                  </div>
                );
              }
              if (item.itemType === "responsible") {
                if (!card.responsibleUserId) return null;
                const name = memberNamesById.get(card.responsibleUserId) ?? "Участник";
                return (
                  <span key={item.id} className="rounded bg-app-surface-muted px-1.5 py-0.5 text-[11px] text-app-secondary">
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
                let chipStyle: CSSProperties | undefined;
                let chipClassName = "rounded bg-app-surface-muted px-1.5 py-0.5 text-[11px] text-app-secondary";
                if (fieldDef.fieldType === "text") {
                  value = snapshot.textValue ?? "";
                } else if (fieldDef.fieldType === "date") {
                  value = snapshot.dateValue ?? "";
                } else if (fieldDef.fieldType === "link") {
                  value = snapshot.linkText || snapshot.linkUrl || "";
                } else if (fieldDef.fieldType === "select") {
                  const option = fieldDef.selectOptions.find((o) => o.id === snapshot.selectOptionId);
                  value = option?.name ?? "";
                  if (option?.color) {
                    chipClassName =
                      "rounded border px-1.5 py-0.5 text-[11px]";
                    chipStyle = {
                      borderColor: option.color,
                      backgroundColor: `color-mix(in srgb, ${option.color} 16%, var(--bg-surface))`,
                      color: "var(--text-primary)"
                    };
                  }
                }
                if (!value) return null;
                return (
                  <span key={item.id} className={chipClassName} style={chipStyle}>
                    {value}
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
  enableDrag,
  shouldSuppressCardModalOpenClick,
  registerCardNode,
  /** FDND3.1: при активном float-drag контент карточки только в overlay; в списке — зазор этой высоты. */
  listDragPlaceholderHeightPx,
  /** FDND3.3: активная карточка вынесена из потока списка; `useSortable` остаётся на скрытом узле вне визуального порядка. */
  floatingSourceAnchor,
  /** Пока другая карточка в float-drag, не применять reorder-transform от `@dnd-kit` — раскладка уже задаётся `displayFlow`. */
  suppressListReorderTransform
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
  shouldSuppressCardModalOpenClick: () => boolean;
  registerCardNode?: (cardId: string, node: HTMLDivElement | null) => void;
  listDragPlaceholderHeightPx?: number;
  floatingSourceAnchor?: boolean;
  suppressListReorderTransform?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: card.id,
    disabled: !enableDrag
  });

  const handleNodeRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      registerCardNode?.(card.id, node);
    },
    [card.id, registerCardNode, setNodeRef]
  );

  if (floatingSourceAnchor) {
    return (
      <div
        ref={handleNodeRef}
        style={{
          position: "fixed",
          left: -9999,
          top: 0,
          width: 1,
          height: 1,
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
          transition,
          transform: "none"
        }}
        aria-hidden
      />
    );
  }

  // Активная карточка рендерится в `DragOverlay`; в списке — только sortable-оболочка и зазор (FDND3.1), без второго `BoardCardRow`.
  // Соседям по вертикали по-прежнему обнуляем translateX — иначе transform сортируемого списка «ломает» горизонтальную сетку колонки.
  const isFloatingCardDrag = enableDrag && isDragging;
  const showListPlaceholder =
    isFloatingCardDrag && listDragPlaceholderHeightPx != null && listDragPlaceholderHeightPx > 0;
  const style: CSSProperties =
    showListPlaceholder ?
      {
        transition,
        pointerEvents: "none"
      }
    : isFloatingCardDrag ?
      {
        opacity: 0,
        transition,
        pointerEvents: "none"
      }
    : suppressListReorderTransform ?
      {
        transform: undefined,
        transition: undefined,
        opacity: 1
      }
    : {
        transform:
          transform ? CSS.Transform.toString({ ...transform, x: 0 }) : undefined,
        transition,
        opacity: 1
      };

  return (
    <div
      ref={handleNodeRef}
      style={style}
      role="listitem"
      className="w-full min-w-0 max-w-full shrink-0"
    >
      {showListPlaceholder ?
        <BoardCardInsertSlot heightPx={listDragPlaceholderHeightPx} />
      : <BoardCardRow
          card={card}
          currentUserId={currentUserId}
          cardContentPermissions={cardContentPermissions}
          boardLabels={boardLabels}
          previewItems={previewItems}
          fieldDefinitions={fieldDefinitions}
          memberNamesById={memberNamesById}
          memberAvatarsById={memberAvatarsById}
          onOpen={onOpen}
          sortableDragSurface={
            enableDrag ? { attributes, listeners, setActivatorNodeRef } : undefined
          }
          isSortableDragging={enableDrag && isDragging}
          shouldSuppressCardModalOpenClick={shouldSuppressCardModalOpenClick}
        />
      }
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
  visibleColumnIds: string[];
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
  onOpenCard,
  shouldSuppressCardModalOpenClick,
  registerCardNode,
  cardDragOverlay,
  cardOrderByColumn
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
  shouldSuppressCardModalOpenClick: () => boolean;
  registerCardNode?: (cardId: string, node: HTMLDivElement | null) => void;
  cardDragOverlay: CardDragOverlayState | null;
  cardOrderByColumn: Record<string, string[]>;
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

  const useSlotProjection = canMoveCards && cardDragOverlay != null;
  const displayFlow =
    useSlotProjection && cardDragOverlay ?
      buildCardDisplayFlowForColumn(
        col.id,
        cardOrderByColumn,
        cardDragOverlay.activeCardId,
        cardDragOverlay.lastValidSlot
      )
    : null;
  const floatingAnchorCard =
    useSlotProjection && cardDragOverlay && col.id === cardDragOverlay.sourceColumnId ?
      (cardsById.get(cardDragOverlay.activeCardId) ?? null)
    : null;
  const isPersistedEmptyColumn = cards.length === 0;
  const showEmptyColumnHint =
    displayFlow != null ?
      displayFlow.length === 0 && !(cardDragOverlay && isPersistedEmptyColumn)
    : cards.length === 0;

  const sortableCardProps = {
    currentUserId,
    cardContentPermissions,
    boardLabels,
    previewItems,
    fieldDefinitions,
    memberNamesById,
    memberAvatarsById,
    onOpen: onOpenCard,
    enableDrag: canMoveCards,
    shouldSuppressCardModalOpenClick,
    registerCardNode
  } as const;

  const showBottomEmptyColumnDrop =
    canMoveCards && !(cardDragOverlay && isPersistedEmptyColumn);

  const sortableContextCardIds = React.useMemo(() => {
    if (!useSlotProjection || !cardDragOverlay) return cardIds;
    return sortableCardIdsForFloatDragColumn(col.id, cardOrderByColumn, cardDragOverlay);
  }, [useSlotProjection, cardDragOverlay, col.id, cardOrderByColumn, cardIds]);

  return (
    <div
      ref={setNodeRef}
      style={columnStyle}
      data-board-column-id={col.id}
      className={COLUMN_SHELL_CLASS}
    >
      <BoardColumnHeader
        boardId={boardId}
        columnId={col.id}
        name={col.name}
        columnType={col.columnType}
        columnNameForCreateHint={col.name}
        cardCount={cards.length}
        columnIndex={index}
        columnCount={columnCount}
        isLastColumn={index === columnCount - 1}
        canCreate={columnPermissions.canCreate}
        canRename={columnPermissions.canRename}
        canReorder={columnSortableEnabled}
        canDelete={columnPermissions.canDelete}
        columnDrag={columnDrag}
      />
      <SortableContext items={sortableContextCardIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {floatingAnchorCard ?
            <SortableBoardCard
              key={floatingAnchorCard.id}
              card={floatingAnchorCard}
              {...sortableCardProps}
              floatingSourceAnchor
            />
          : null}
          <div className="board-column-cards-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1" role="list">
            {displayFlow != null && cardDragOverlay ?
              <>
                {displayFlow.map((row) => {
                  if (row.kind === "slot") {
                    return (
                      <div key={BOARD_CARD_SLOT_LIST_KEY} role="listitem">
                        {isPersistedEmptyColumn ?
                          <EmptyColumnCardDropSlot
                            columnId={col.id}
                            heightPx={cardDragOverlay.overlaySize.height}
                          />
                        : <BoardCardInsertSlot heightPx={cardDragOverlay.overlaySize.height} />}
                      </div>
                    );
                  }
                  const c = cardsById.get(row.id);
                  return c ?
                      <SortableBoardCard
                        key={row.id}
                        card={c}
                        {...sortableCardProps}
                        suppressListReorderTransform={
                          Boolean(cardDragOverlay && cardDragOverlay.activeCardId !== row.id)
                        }
                      />
                    : null;
                })}
                {isPersistedEmptyColumn && displayFlow.length === 0 ?
                  <div role="listitem">
                    <EmptyColumnCardDropSlot
                      columnId={col.id}
                      heightPx={cardDragOverlay.overlaySize.height}
                    />
                  </div>
                : null}
              </>
            : cards.map((card) => (
                <SortableBoardCard
                  key={card.id}
                  card={card}
                  {...sortableCardProps}
                  listDragPlaceholderHeightPx={
                    cardDragOverlay?.activeCardId === card.id ?
                      cardDragOverlay.overlaySize.height
                    : undefined
                  }
                />
              ))}
            {showEmptyColumnHint ?
              <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-app-divider bg-app-surface-muted/40 px-3 py-6 text-center text-xs text-app-tertiary">
                Пока нет карточек
              </div>
            : null}
          </div>
          {showBottomEmptyColumnDrop ?
            <EmptyColumnDrop columnId={col.id} emphasized={cards.length === 0} />
          : null}
        </div>
      </SortableContext>
      {canRenderCreateCardButton(col.columnType) ? (
        <CreateCardButton
          boardId={boardId}
          columnId={col.id}
          canCreate={canCreateCard}
          fieldDefinitions={fieldDefinitions}
          currentUserId={currentUserId}
        />
      ) : null}
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
  onOpenCard,
  shouldSuppressCardModalOpenClick,
  registerCardNode,
  cardDragOverlay,
  cardOrderByColumn
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
  shouldSuppressCardModalOpenClick: () => boolean;
  registerCardNode?: (cardId: string, node: HTMLDivElement | null) => void;
  cardDragOverlay: CardDragOverlayState | null;
  cardOrderByColumn: Record<string, string[]>;
}) {
  const cards = cardIds.map((id) => cardsById.get(id)).filter(Boolean) as BoardCardListItem[];

  const useSlotProjection = canMoveCards && cardDragOverlay != null;
  const displayFlow =
    useSlotProjection && cardDragOverlay ?
      buildCardDisplayFlowForColumn(
        col.id,
        cardOrderByColumn,
        cardDragOverlay.activeCardId,
        cardDragOverlay.lastValidSlot
      )
    : null;
  const floatingAnchorCard =
    useSlotProjection && cardDragOverlay && col.id === cardDragOverlay.sourceColumnId ?
      (cardsById.get(cardDragOverlay.activeCardId) ?? null)
    : null;
  const isPersistedEmptyColumn = cards.length === 0;
  const showEmptyColumnHint =
    displayFlow != null ?
      displayFlow.length === 0 && !(cardDragOverlay && isPersistedEmptyColumn)
    : cards.length === 0;

  const sortableCardProps = {
    currentUserId,
    cardContentPermissions,
    boardLabels,
    previewItems,
    fieldDefinitions,
    memberNamesById,
    memberAvatarsById,
    onOpen: onOpenCard,
    enableDrag: canMoveCards,
    shouldSuppressCardModalOpenClick,
    registerCardNode
  } as const;

  const showBottomEmptyColumnDrop =
    canMoveCards && !(cardDragOverlay && isPersistedEmptyColumn);

  const sortableContextCardIds = React.useMemo(() => {
    if (!useSlotProjection || !cardDragOverlay) return cardIds;
    return sortableCardIdsForFloatDragColumn(col.id, cardOrderByColumn, cardDragOverlay);
  }, [useSlotProjection, cardDragOverlay, col.id, cardOrderByColumn, cardIds]);

  return (
    <div className={COLUMN_SHELL_CLASS} data-board-column-id={col.id}>
      <BoardColumnHeader
        boardId={boardId}
        columnId={col.id}
        name={col.name}
        columnType={col.columnType}
        columnNameForCreateHint={col.name}
        cardCount={cards.length}
        columnIndex={index}
        columnCount={columnCount}
        isLastColumn={index === columnCount - 1}
        canCreate={columnPermissions.canCreate}
        canRename={columnPermissions.canRename}
        canReorder={false}
        canDelete={columnPermissions.canDelete}
        columnDrag={null}
      />
      <SortableContext items={sortableContextCardIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {floatingAnchorCard ?
            <SortableBoardCard
              key={floatingAnchorCard.id}
              card={floatingAnchorCard}
              {...sortableCardProps}
              floatingSourceAnchor
            />
          : null}
          <div className="board-column-cards-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1" role="list">
            {displayFlow != null && cardDragOverlay ?
              <>
                {displayFlow.map((row) => {
                  if (row.kind === "slot") {
                    return (
                      <div key={BOARD_CARD_SLOT_LIST_KEY} role="listitem">
                        {isPersistedEmptyColumn ?
                          <EmptyColumnCardDropSlot
                            columnId={col.id}
                            heightPx={cardDragOverlay.overlaySize.height}
                          />
                        : <BoardCardInsertSlot heightPx={cardDragOverlay.overlaySize.height} />}
                      </div>
                    );
                  }
                  const c = cardsById.get(row.id);
                  return c ?
                      <SortableBoardCard
                        key={row.id}
                        card={c}
                        {...sortableCardProps}
                        suppressListReorderTransform={
                          Boolean(cardDragOverlay && cardDragOverlay.activeCardId !== row.id)
                        }
                      />
                    : null;
                })}
                {isPersistedEmptyColumn && displayFlow.length === 0 ?
                  <div role="listitem">
                    <EmptyColumnCardDropSlot
                      columnId={col.id}
                      heightPx={cardDragOverlay.overlaySize.height}
                    />
                  </div>
                : null}
              </>
            : cards.map((card) => (
                <SortableBoardCard
                  key={card.id}
                  card={card}
                  {...sortableCardProps}
                  listDragPlaceholderHeightPx={
                    cardDragOverlay?.activeCardId === card.id ?
                      cardDragOverlay.overlaySize.height
                    : undefined
                  }
                />
              ))}
            {showEmptyColumnHint ?
              <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-app-divider bg-app-surface-muted/40 px-3 py-6 text-center text-xs text-app-tertiary">
                Пока нет карточек
              </div>
            : null}
          </div>
          {showBottomEmptyColumnDrop ?
            <EmptyColumnDrop columnId={col.id} emphasized={cards.length === 0} />
          : null}
        </div>
      </SortableContext>
      {canRenderCreateCardButton(col.columnType) ? (
        <CreateCardButton
          boardId={boardId}
          columnId={col.id}
          canCreate={canCreateCard}
          fieldDefinitions={fieldDefinitions}
          currentUserId={currentUserId}
        />
      ) : null}
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
  onOpenCard,
  /** `true` только пока ждём client mount DnD при `canMoveCards` — визуальный контракт как у `sortableDragSurface`, без listeners (DND7.1). */
  visualMoveSurface = false
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
  visualMoveSurface?: boolean;
}) {
  const columnCount = columnRows.length;
  return (
    <div className="flex h-full min-h-0 w-max min-w-full items-start gap-3 pl-3 pr-3 md:gap-4 md:pl-4 md:pr-4">
      {columnRows.map((col, index) => (
        <div
          key={col.id}
          data-board-column-id={col.id}
          className={COLUMN_SHELL_CLASS}
        >
          <BoardColumnHeader
            boardId={boardId}
            columnId={col.id}
            name={col.name}
            columnType={col.columnType}
            columnNameForCreateHint={col.name}
            cardCount={(cardOrderByColumn[col.id] ?? []).length}
            columnIndex={index}
            columnCount={columnCount}
            isLastColumn={index === columnCount - 1}
            canCreate={columnPermissions.canCreate}
            canRename={columnPermissions.canRename}
            canReorder={false}
            canDelete={columnPermissions.canDelete}
            columnDrag={null}
          />
          <div className="board-column-cards-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1" role="list">
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
                    visualMoveSurface={visualMoveSurface}
                  />
                </div>
              ))}
            {(cardOrderByColumn[col.id] ?? []).length === 0 ?
              <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-app-divider bg-app-surface-muted/40 px-3 py-6 text-center text-xs text-app-tertiary">
                Пока нет карточек
              </div>
            : null}
          </div>
          {canRenderCreateCardButton(col.columnType) ? (
            <CreateCardButton
              boardId={boardId}
              columnId={col.id}
              canCreate={canCreateCard}
              fieldDefinitions={fieldDefinitions}
              currentUserId={currentUserId}
            />
          ) : null}
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
  visibleColumnIds,
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
  const [cardDragOverlay, setCardDragOverlay] = React.useState<CardDragOverlayState | null>(null);
  const cardDragOverlayRef = React.useRef<CardDragOverlayState | null>(null);
  React.useEffect(() => {
    cardDragOverlayRef.current = cardDragOverlay;
  }, [cardDragOverlay]);
  const localRef = React.useRef(local);
  localRef.current = local;
  const pendingColumnSignatureRef = React.useRef<string | null>(null);
  const pendingCardSignatureRef = React.useRef<string | null>(null);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragInProgressRef = React.useRef(false);
  const cardNodeByIdRef = React.useRef(new Map<string, HTMLDivElement>());
  /**
   * После drop/cancel drag карточки браузер (мышь или touch) может сгенерировать «хвостовой» click
   * на элемент под курсором — не открываем модалку, пока живёт это окно.
   */
  const suppressCardModalOpenUntilMsRef = React.useRef(0);
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
  }, [boardId, cardsByColumnId, cardSig]);

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

  const shouldSuppressCardModalOpenClick = React.useCallback(() => {
    return Date.now() < suppressCardModalOpenUntilMsRef.current;
  }, []);

  const registerCardNode = React.useCallback((cardId: string, node: HTMLDivElement | null) => {
    if (node) {
      cardNodeByIdRef.current.set(cardId, node);
      return;
    }
    cardNodeByIdRef.current.delete(cardId);
  }, []);

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
    // Touch: `touchstart` раньше `pointerdown` и удерживает `activeRef`, поэтому для пальца
    // работает только этот сенсор — задержка даёт колонке `overflow-y-auto` время на вертикальный scroll
    // без старта drag при смещении >8px (как у PointerSensor). Мышь/перо без touch — только PointerSensor.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const showColumnDnd = columnPermissions.canReorder;
  const showAnyDnd = showColumnDnd || canMoveCards;
  const visibleColumnIdsSet = React.useMemo(() => new Set(visibleColumnIds), [visibleColumnIds]);
  const visibleColumnItems = React.useMemo(
    () => local.columnItems.filter((column) => visibleColumnIdsSet.has(column.id)),
    [local.columnItems, visibleColumnIdsSet]
  );
  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    dragInProgressRef.current = true;
    if (isColumnDndId(event.active.id)) {
      setCardDragOverlay(null);
      return;
    }

    const activeCardId = String(event.active.id);
    const activeCard = local.cardsById.get(activeCardId) ?? null;
    const cardNode = cardNodeByIdRef.current.get(activeCardId) ?? null;
    const rect = cardNode?.getBoundingClientRect();
    if (!activeCard || !rect || rect.width <= 0 || rect.height <= 0) {
      setCardDragOverlay(null);
      return;
    }

    const sourceColumnId = findColumnForCard(local.cardOrderByColumn, activeCardId);
    if (!sourceColumnId || !visibleColumnIdsSet.has(sourceColumnId)) {
      setCardDragOverlay(null);
      return;
    }
    const sourceIndex = local.cardOrderByColumn[sourceColumnId]?.indexOf(activeCardId) ?? -1;
    if (sourceIndex < 0) {
      setCardDragOverlay(null);
      return;
    }

    const initialSlot: CardSlotPosition = { columnId: sourceColumnId, index: sourceIndex };
    setCardDragOverlay({
      activeCardId,
      card: activeCard,
      overlaySize: {
        width: rect.width,
        height: rect.height
      },
      sourceColumnId,
      sourceIndex,
      currentSlot: initialSlot,
      lastValidSlot: initialSlot
    });
  }, [local.cardsById, local.cardOrderByColumn, visibleColumnIdsSet]);

  const handleDragOver = React.useCallback(
    (event: DragOverEvent) => {
      if (isColumnDndId(event.active.id)) return;
      const { over } = event;
      setCardDragOverlay((prev) => {
        if (!prev) return prev;
        if (!over) return prev;
        const t = resolveCardDropTargetVirtual(
          over.id,
          localRef.current.cardOrderByColumn,
          prev.activeCardId,
          visibleColumnIdsSet
        );
        if (!t) return prev;
        return { ...prev, currentSlot: t, lastValidSlot: t };
      });
    },
    [visibleColumnIdsSet]
  );

  const handleDragCancel = (event: DragCancelEvent) => {
    dragInProgressRef.current = false;
    setCardDragOverlay(null);
    if (!isColumnDndId(event.active.id)) {
      suppressCardModalOpenUntilMsRef.current = Date.now() + CARD_DRAG_SUPPRESS_MODAL_OPEN_MS;
    }
    if (refreshQueuedDuringDragRef.current) {
      refreshQueuedDuringDragRef.current = false;
      router.refresh();
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    dragInProgressRef.current = false;
    const { active, over } = event;
    const cardDragSessionSnapshot =
      !isColumnDndId(active.id) ? cardDragOverlayRef.current : null;
    setCardDragOverlay(null);
    if (!isColumnDndId(active.id)) {
      suppressCardModalOpenUntilMsRef.current = Date.now() + CARD_DRAG_SUPPRESS_MODAL_OPEN_MS;
    }
    setPersistError(null);
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
      if (!visibleColumnIdsSet.has(activeKey) || !visibleColumnIdsSet.has(overKey)) return;

      const previousCols = local.columnItems;
      const nextCols = reorderVisibleColumnsInGlobalOrder(
        local.columnItems,
        visibleColumnIdsSet,
        activeKey,
        overKey
      );
      if (nextCols === previousCols) return;
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
    if (!visibleColumnIdsSet.has(fromCol)) return;

    let target: { columnId: string; index: number } | null = null;
    if (cardDragSessionSnapshot?.activeCardId === activeCardId) {
      target = virtualCardSlotToApplyTarget(
        local.cardOrderByColumn,
        activeCardId,
        fromCol,
        cardDragSessionSnapshot.lastValidSlot
      );
    }
    if (!target) {
      target = resolveCardDropTarget(over.id, local.cardOrderByColumn, visibleColumnIdsSet);
    }
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
          columnRows={visibleColumnItems}
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
          columnRows={visibleColumnItems}
          cardOrderByColumn={local.cardOrderByColumn}
          cardsById={local.cardsById}
          onOpenCard={(c) => setEditingCardId(c.id)}
          visualMoveSurface={canMoveCards}
        />
      </>
    );
  }

  const columnRow =
    showColumnDnd ?
      <SortableContext
        items={visibleColumnItems.map((c) => columnDndId(c.id))}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex h-full min-h-0 w-max min-w-full items-start gap-3 pl-3 pr-3 md:gap-4 md:pl-4 md:pr-4">
          {visibleColumnItems.map((col, index) => (
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
              columnCount={visibleColumnItems.length}
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
              shouldSuppressCardModalOpenClick={shouldSuppressCardModalOpenClick}
              registerCardNode={registerCardNode}
              cardDragOverlay={cardDragOverlay}
              cardOrderByColumn={local.cardOrderByColumn}
            />
          ))}
        </div>
      </SortableContext>
    : <div className="flex h-full min-h-0 w-max min-w-full items-start gap-3 pl-3 pr-3 md:gap-4 md:pl-4 md:pr-4">
        {visibleColumnItems.map((col, index) => (
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
            columnCount={visibleColumnItems.length}
            columnPermissions={columnPermissions}
            cardContentPermissions={cardContentPermissions}
            cardIds={local.cardOrderByColumn[col.id] ?? []}
            cardsById={local.cardsById}
            boardLabels={boardLabels}
            previewItems={previewItems}
            memberNamesById={memberNamesById}
            memberAvatarsById={memberAvatarsById}
            onOpenCard={(c) => setEditingCardId(c.id)}
            shouldSuppressCardModalOpenClick={shouldSuppressCardModalOpenClick}
            registerCardNode={registerCardNode}
            cardDragOverlay={cardDragOverlay}
            cardOrderByColumn={local.cardOrderByColumn}
          />
        ))}
      </div>;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-1">
      {editModal}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {realtimeStatus !== "SUBSCRIBED" || realtimeError ? (
          <p className="text-[11px] text-app-tertiary">
            Realtime:{" "}
            <span
              className={realtimeStatus === "SUBSCRIBED" ? "" : ""}
              style={{
                color:
                  realtimeStatus === "SUBSCRIBED" ? "var(--success-subtle-text)" : "var(--warning-subtle-text)"
              }}
            >
              {realtimeStatus}
            </span>
            {realtimeError ? <span className="ml-2" style={{ color: "var(--danger-subtle-text)" }}>{realtimeError}</span> : null}
          </p>
        ) : null}
      </div>
      {persistError ?
        <p className="text-xs text-app-validation-error" role="alert">
          {persistError}
        </p>
      : null}
      <div className="min-h-0 flex-1 overflow-y-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          {columnRow}
          <DragOverlay>
            {cardDragOverlay ?
              <div
                style={{
                  width: cardDragOverlay.overlaySize.width,
                  height: cardDragOverlay.overlaySize.height
                }}
              >
                <BoardCardRow
                  card={cardDragOverlay.card}
                  currentUserId={currentUserId}
                  cardContentPermissions={cardContentPermissions}
                  boardLabels={boardLabels}
                  previewItems={previewItems}
                  fieldDefinitions={fieldDefinitions}
                  memberNamesById={memberNamesById}
                  memberAvatarsById={memberAvatarsById}
                  onOpen={() => {}}
                  disableOpen
                />
              </div>
            : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
