import type { NotificationEventType } from "@/lib/notifications/constants";

const EVENT_LABEL: Record<NotificationEventType, string> = {
  added_to_card: "Добавление в карточку",
  made_responsible: "Назначение ответственным",
  card_comment_new: "Новый комментарий",
  card_moved: "Перемещение карточки",
  card_in_progress: "Карточка в работе",
  card_ready: "Карточка готова"
};

type FormatOutboxEmailInput = {
  eventType: NotificationEventType;
  title: string;
  body: string;
  linkUrl: string;
};

function normalizeMultilineText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function formatOutboxEmailText(input: FormatOutboxEmailInput): string {
  const body = normalizeMultilineText(input.body);
  const link = input.linkUrl.trim();
  const eventLabel = EVENT_LABEL[input.eventType];

  const lines = [
    `${input.title.trim()}`,
    "",
    `Тип события: ${eventLabel}`,
    "",
    body || "Описание события отсутствует.",
    "",
    `Ссылка: ${link}`,
    "",
    "Это автоматическое уведомление из центра уведомлений DoIt."
  ];

  return lines.join("\n");
}
