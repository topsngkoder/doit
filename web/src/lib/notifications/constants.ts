export const NOTIFICATION_EVENT_TYPES = [
  "added_to_card",
  "made_responsible",
  "card_comment_new",
  "card_moved"
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["telegram", "internal"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_EVENT_TYPE_LABEL: Record<NotificationEventType, string> = {
  added_to_card: "Вас добавили в карточку",
  made_responsible: "Сделали ответственным",
  card_comment_new: "Новый комментарий в карточке",
  card_moved: "Перемещение карточки"
};

export const NOTIFICATION_CHANNEL_LABEL: Record<NotificationChannel, string> = {
  telegram: "Telegram",
  internal: "Внутренние"
};

