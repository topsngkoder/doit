export const NOTIFICATION_EVENT_TYPES = [
  "added_to_card",
  "made_responsible",
  "card_comment_new",
  "card_moved",
  "card_in_progress",
  "card_ready"
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["browser", "email"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export function isNotificationChannel(v: string): v is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(v);
}

export function isNotificationEventType(v: string): v is NotificationEventType {
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(v);
}

export const NOTIFICATION_EVENT_TYPE_LABEL: Record<NotificationEventType, string> = {
  added_to_card: "Вас добавили в карточку",
  made_responsible: "Сделали ответственным",
  card_comment_new: "Новый комментарий в карточке",
  card_moved: "Перемещение карточки",
  card_in_progress: "Ваша карточка в работе",
  card_ready: "Ваша карточка готова"
};

export const NOTIFICATION_CHANNEL_LABEL: Record<NotificationChannel, string> = {
  browser: "В браузере",
  email: "По email"
};
