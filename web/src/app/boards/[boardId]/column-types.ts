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
