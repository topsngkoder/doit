export const COLUMN_TYPES = ["queue", "in_work", "done", "info"] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

/** Права на мутации колонок доски (см. board_role_permissions). */
export type BoardColumnPermissions = {
  canCreate: boolean;
  canRename: boolean;
  canReorder: boolean;
  canDelete: boolean;
};

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
