export const BOARD_FIELD_TYPES = ["text", "date", "select", "link", "yandex_disk"] as const;

export type BoardCatalogFieldType = (typeof BOARD_FIELD_TYPES)[number];

export const BOARD_FIELD_TYPE_OPTIONS: ReadonlyArray<{
  value: BoardCatalogFieldType;
  label: string;
}> = [
  { value: "text", label: "Текст" },
  { value: "date", label: "Дата" },
  { value: "select", label: "Список" },
  { value: "link", label: "Ссылка" },
  { value: "yandex_disk", label: "Яндекс диск" }
];

export function isBoardFieldType(v: string): v is BoardCatalogFieldType {
  return (BOARD_FIELD_TYPES as readonly string[]).includes(v);
}
