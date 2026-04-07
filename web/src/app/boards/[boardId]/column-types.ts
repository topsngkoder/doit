export const COLUMN_TYPES = ["queue", "in_work", "done", "info"] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

/** Права на мутации колонок доски (см. board_role_permissions). */
export type BoardColumnPermissions = {
  canCreate: boolean;
  canRename: boolean;
  canReorder: boolean;
  canDelete: boolean;
};

/** Права на редактирование контента карточки и удаление (own / any). */
export type CardContentPermissions = {
  canEditAny: boolean;
  canEditOwn: boolean;
  canDeleteAny: boolean;
  canDeleteOwn: boolean;
};

/** Метка доски (каталог на уровне board). */
export type BoardLabelOption = {
  id: string;
  name: string;
  color: string;
  position: number;
};

export type BoardCardPreviewItem = {
  id: string;
  itemType: "title" | "assignees" | "comments_count" | "labels" | "responsible" | "custom_field";
  fieldDefinitionId: string | null;
  enabled: boolean;
  position: number;
};

/** Снимок строки card_field_values для UI (по id определения поля). */
export type CardFieldValueSnapshot = {
  textValue: string | null;
  dateValue: string | null;
  linkUrl: string | null;
  linkText: string | null;
  selectOptionId: string | null;
};

export type CardActivityEntry = {
  id: string;
  activityType: string;
  message: string;
  createdAt: string;
  actorUserId: string;
  actorDisplayName: string;
};

export type BoardCardListItem = {
  id: string;
  title: string;
  description: string;
  position: number;
  createdByUserId: string;
  /** Текущий ответственный (если есть). */
  responsibleUserId: string | null;
  /** Участники карточки (user_id), минимум один по правилам продукта. */
  assigneeUserIds: string[];
  /** id меток, назначенных на карточку. */
  labelIds: string[];
  /** Количество не удалённых комментариев карточки. */
  commentsCount: number;
  /** Пользовательские поля доски: ключ — field_definition_id. */
  fieldValues: Record<string, CardFieldValueSnapshot>;
  /** История карточки (новые сверху). */
  activityEntries: CardActivityEntry[];
};

export function canEditCardContent(
  perms: CardContentPermissions,
  createdByUserId: string,
  currentUserId: string
): boolean {
  return (
    perms.canEditAny ||
    (perms.canEditOwn && createdByUserId === currentUserId)
  );
}

/** Участник карточки (assignee) может менять название/описание и кастомные поля, но не состав участников без прав редактора. */
export function canEditCardBodyAsAssignee(
  card: Pick<BoardCardListItem, "assigneeUserIds">,
  currentUserId: string
): boolean {
  return card.assigneeUserIds.includes(currentUserId);
}

export function canOpenCardModal(
  perms: CardContentPermissions,
  card: BoardCardListItem,
  currentUserId: string
): boolean {
  return (
    canEditCardContent(perms, card.createdByUserId, currentUserId) ||
    canDeleteCard(perms, card.createdByUserId, currentUserId) ||
    canEditCardBodyAsAssignee(card, currentUserId)
  );
}

export function canDeleteCard(
  perms: CardContentPermissions,
  createdByUserId: string,
  currentUserId: string
): boolean {
  return (
    perms.canDeleteAny ||
    (perms.canDeleteOwn && createdByUserId === currentUserId)
  );
}

export function columnTypeLabel(key: string): string {
  switch (key) {
    case "queue":
      return "Очередь";
    case "in_work":
      return "В работе";
    case "done":
      return "Готово";
    case "info":
      return "Информационный";
    default:
      return key;
  }
}
